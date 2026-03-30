from __future__ import annotations

import json
import os
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import h5py
import numpy as np
import psycopg
from psycopg.types.json import Json

from app.core.config import settings


@dataclass
class TripRow:
    trip_uid: str
    source_trip_key: str | None
    devid: str | None
    trip_date: str | None
    start_time: datetime | None
    end_time: datetime | None
    point_count: int
    valid_point_count: int
    is_valid: bool
    source_file: str


@dataclass
class PendingTrip:
    idx: int
    trip: TripRow
    devid: str | None
    lats: np.ndarray
    lons: np.ndarray
    speeds: np.ndarray
    tms: np.ndarray


def start_pipeline_run(
    cur: psycopg.Cursor,
    *,
    mode: str,
    source_file: str,
    max_trips: int | None,
) -> int:
    cur.execute(
        "INSERT INTO ingest_runs (run_type, source_file, status, meta) VALUES (%s, %s, %s, %s) RETURNING id",
        (
            f"pipeline_{mode}",
            source_file,
            "running",
            Json({"max_trips": max_trips}),
        ),
    )
    row = cur.fetchone()
    if row is None:
        raise RuntimeError("failed to create ingest run")
    return int(row[0])


def finalize_pipeline_run_success(
    cur: psycopg.Cursor,
    *,
    run_id: int,
    mode: str,
    ingest_counts: dict[str, int],
    chunk_size: int,
    workers: int | None,
    trip_upsert_batch_size: int,
    source_key: str | None,
    file_shards: int,
    pg_fast_mode: bool,
) -> None:
    cur.execute(
        "UPDATE ingest_runs SET finished_at = now(), status = %s, row_count = %s, meta = meta || %s::jsonb WHERE id = %s",
        (
            "success",
            sum(ingest_counts.values()) if mode == "rebuild" else 0,
            Json(
                {
                    "step1_ingest": ingest_counts,
                    "mode": mode,
                    "chunk_size": chunk_size,
                    "workers": workers,
                    "trip_upsert_batch_size": trip_upsert_batch_size,
                    "source_key": source_key,
                    "file_shards": file_shards,
                    "pg_fast_mode": pg_fast_mode,
                }
            ),
            run_id,
        ),
    )


def finalize_pipeline_run_failure(
    cur: psycopg.Cursor, *, run_id: int, error_message: str
) -> None:
    cur.execute(
        "UPDATE ingest_runs SET finished_at = now(), status = %s, error_message = %s WHERE id = %s",
        ("failed", error_message, run_id),
    )


def mark_stale_running_pipeline_runs(
    cur: psycopg.Cursor, *, current_run_id: int
) -> None:
    cur.execute(
        """
        UPDATE ingest_runs
        SET
          finished_at = now(),
          status = 'failed',
          error_message = 'stale running record closed by newer execution'
        WHERE status = 'running'
          AND run_type LIKE 'pipeline_%%'
          AND id <> %s
        """,
        (current_run_id,),
    )


def try_acquire_rebuild_lock(cur: psycopg.Cursor, lock_key: int) -> bool:
    cur.execute("SELECT pg_try_advisory_lock(%s)", (lock_key,))
    row = cur.fetchone()
    return bool(row and row[0])


def release_rebuild_lock(cur: psycopg.Cursor, lock_key: int) -> None:
    cur.execute("SELECT pg_advisory_unlock(%s)", (lock_key,))


def truncate_ingest_detail_tables(cur: psycopg.Cursor) -> None:
    cur.execute(
        """
        TRUNCATE TABLE
          trip_segments,
          trip_points_matched,
          trip_match_meta,
          trip_points_raw,
          trips
        RESTART IDENTITY CASCADE
        """
    )


def drop_ingest_hot_indexes(cur: psycopg.Cursor) -> None:
    cur.execute(
        """
        DROP INDEX IF EXISTS idx_raw_trip_seq;
        DROP INDEX IF EXISTS idx_raw_geom;
        DROP INDEX IF EXISTS idx_matched_trip_seq;
        DROP INDEX IF EXISTS idx_matched_geom;
        DROP INDEX IF EXISTS idx_segments_trip_seq;
        DROP INDEX IF EXISTS idx_segments_road;
        """
    )


def create_ingest_hot_indexes(cur: psycopg.Cursor) -> None:
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_raw_trip_seq ON trip_points_raw(trip_id, point_seq);
        CREATE INDEX IF NOT EXISTS idx_raw_geom ON trip_points_raw USING gist(geom);
        CREATE INDEX IF NOT EXISTS idx_matched_trip_seq ON trip_points_matched(trip_id, point_seq);
        CREATE INDEX IF NOT EXISTS idx_matched_geom ON trip_points_matched USING gist(geom);
        CREATE INDEX IF NOT EXISTS idx_segments_trip_seq ON trip_segments(trip_id, segment_seq);
        CREATE INDEX IF NOT EXISTS idx_segments_road ON trip_segments(road_id);
        """
    )


def _copy_rows(cur: psycopg.Cursor, copy_sql: str, rows: list[tuple[Any, ...]]) -> None:
    if not rows:
        return
    with cur.copy(copy_sql) as copy:
        for row in rows:
            copy.write_row(row)


def _flush_copy_buffer(
    cur: psycopg.Cursor,
    copy_sql: str,
    buffer: list[tuple[Any, ...]],
) -> int:
    if not buffer:
        return 0
    count = len(buffer)
    _copy_rows(cur, copy_sql, buffer)
    buffer.clear()
    return count


def _ewkt_point(lon: float | None, lat: float | None) -> str | None:
    if lon is None or lat is None:
        return None
    return f"SRID=4326;POINT({lon} {lat})"


def _ewkt_with_srid(geom_text: str | None) -> str | None:
    if not geom_text:
        return None
    geom = geom_text.strip()
    if not geom:
        return None
    if geom.upper().startswith("SRID="):
        return geom
    return f"SRID=4326;{geom}"


def _to_nullable_str(value: Any) -> str | None:
    if value is None or value == "":
        return None
    return str(value)


def ts_to_dt(ts: float | int | None) -> datetime | None:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(float(ts))
    except (ValueError, OSError, OverflowError):
        return None


def _resolve_ref_array(f: h5py.File, ref: Any) -> np.ndarray:
    obj = f[ref]
    return obj[()]


def _decode_bytes(x: Any) -> Any:
    if isinstance(x, bytes):
        return x.decode("utf-8", errors="ignore")
    return x


def _safe_frac_value(f: h5py.File, value: Any) -> float | None:
    if isinstance(value, h5py.Reference):
        arr = f[value][()]
        try:
            return float(arr)
        except (TypeError, ValueError):
            return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _extract_jld_rows(
    trip_uid: str,
    rec: np.void,
    f: h5py.File,
    default_tms: np.ndarray,
    default_lats: np.ndarray,
    default_lons: np.ndarray,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    roads = (
        _resolve_ref_array(f, rec["roads"])
        if rec["roads"]
        else np.array([], dtype=np.int64)
    )
    times = (
        _resolve_ref_array(f, rec["time"])
        if rec["time"]
        else np.array([], dtype=np.int64)
    )
    frac_refs = (
        _resolve_ref_array(f, rec["frac"])
        if rec["frac"]
        else np.array([], dtype=object)
    )
    route = (
        _resolve_ref_array(f, rec["route"])
        if rec["route"]
        else np.array([], dtype=np.int64)
    )
    headings = (
        _resolve_ref_array(f, rec["route_heading"])
        if rec["route_heading"]
        else np.array([], dtype=object)
    )

    route_geom = np.array([], dtype=object)
    if rec["route_geom"]:
        rg = _resolve_ref_array(f, rec["route_geom"])
        route_geom = (
            rg.flatten() if isinstance(rg, np.ndarray) else np.array([], dtype=object)
        )

    lons = _resolve_ref_array(f, rec["lon"]) if rec["lon"] else default_lons
    lats = _resolve_ref_array(f, rec["lat"]) if rec["lat"] else default_lats
    tms = _resolve_ref_array(f, rec["tms"]) if rec["tms"] else default_tms

    meta_rows: list[dict[str, Any]] = []
    matched_rows: list[dict[str, Any]] = []
    segment_rows: list[dict[str, Any]] = []

    for i in range(len(roads)):
        road_id = str(int(roads[i]))
        ts = (
            int(times[i])
            if i < len(times)
            else (int(tms[min(i, len(tms) - 1)]) if len(tms) else None)
        )
        event_time = ts_to_dt(ts)
        lat = float(lats[min(i, len(lats) - 1)]) if len(lats) else None
        lon = float(lons[min(i, len(lons) - 1)]) if len(lons) else None
        frac_value = _safe_frac_value(f, frac_refs[i]) if i < len(frac_refs) else None
        direction = (
            _decode_bytes(headings[min(i, len(headings) - 1)])
            if len(headings)
            else None
        )

        meta_rows.append(
            {
                "trip_uid": trip_uid,
                "point_seq": i,
                "matched_seq": i,
                "road_id": road_id,
                "road_name": None,
                "direction": direction,
                "is_virtual": False,
                "confidence": None,
                "segment_fraction": frac_value,
                "raw_payload": json.dumps(
                    {
                        "source": "jld2",
                        "route_road_id": int(route[min(i, len(route) - 1)])
                        if len(route)
                        else None,
                    }
                ),
            }
        )

        if lat is not None and lon is not None:
            matched_rows.append(
                {
                    "trip_uid": trip_uid,
                    "point_seq": i,
                    "event_time": event_time,
                    "tms": ts,
                    "lat": lat,
                    "lon": lon,
                    "geom_ewkt": _ewkt_point(lon, lat),
                    "road_id": road_id,
                    "road_name": None,
                    "matched_offset_m": None,
                    "confidence": None,
                    "is_virtual": False,
                }
            )

    for i in range(max(0, len(route_geom))):
        geom_text = _decode_bytes(route_geom[i])
        if not geom_text:
            continue
        from_seq = i
        to_seq = i + 1
        start_ts = int(tms[min(from_seq, len(tms) - 1)]) if len(tms) else None
        end_ts = int(tms[min(to_seq, len(tms) - 1)]) if len(tms) else None
        duration_s = float(max(0, (end_ts - start_ts))) if start_ts and end_ts else None
        start_lat = float(lats[min(from_seq, len(lats) - 1)]) if len(lats) else None
        start_lon = float(lons[min(from_seq, len(lons) - 1)]) if len(lons) else None
        end_lat = float(lats[min(to_seq, len(lats) - 1)]) if len(lats) else None
        end_lon = float(lons[min(to_seq, len(lons) - 1)]) if len(lons) else None

        segment_rows.append(
            {
                "trip_uid": trip_uid,
                "segment_seq": i,
                "from_point_seq": from_seq,
                "to_point_seq": to_seq,
                "start_time": ts_to_dt(start_ts),
                "end_time": ts_to_dt(end_ts),
                "duration_s": duration_s,
                "road_id": str(int(roads[min(i, len(roads) - 1)]))
                if len(roads)
                else None,
                "road_name": None,
                "start_lat": start_lat,
                "start_lon": start_lon,
                "end_lat": end_lat,
                "end_lon": end_lon,
                "path_geom_ewkt": _ewkt_with_srid(geom_text),
            }
        )

    return meta_rows, matched_rows, segment_rows


def upsert_trips_batch(cur: psycopg.Cursor, trips: list[TripRow]) -> dict[str, int]:
    if not trips:
        return {}

    cur.execute(
        """
        CREATE TEMP TABLE IF NOT EXISTS trips_stage (
          stage_seq bigint,
          trip_uid text NOT NULL,
          source_trip_key text,
          devid text,
          trip_date date,
          start_time timestamp,
          end_time timestamp,
          point_count integer NOT NULL,
          valid_point_count integer NOT NULL,
          is_valid boolean NOT NULL,
          source_file text
        ) ON COMMIT DROP
        """
    )
    cur.execute("ALTER TABLE trips_stage ADD COLUMN IF NOT EXISTS stage_seq bigint")
    cur.execute("TRUNCATE trips_stage")

    stage_rows = [
        (
            i,
            t.trip_uid,
            t.source_trip_key,
            t.devid,
            t.trip_date,
            t.start_time,
            t.end_time,
            t.point_count,
            t.valid_point_count,
            t.is_valid,
            t.source_file,
        )
        for i, t in enumerate(trips, start=1)
    ]
    _copy_rows(
        cur,
        """
        COPY trips_stage (
          stage_seq,
          trip_uid, source_trip_key, devid, trip_date, start_time, end_time,
          point_count, valid_point_count, is_valid, source_file
        ) FROM STDIN
        """,
        stage_rows,
    )

    cur.execute(
        """
        WITH dedup AS (
          SELECT DISTINCT ON (trip_uid)
            trip_uid,
            source_trip_key,
            devid,
            trip_date,
            start_time,
            end_time,
            point_count,
            valid_point_count,
            is_valid,
            source_file
          FROM trips_stage
          ORDER BY trip_uid, stage_seq DESC
        )
        INSERT INTO trips (
          trip_uid, source_trip_key, devid, trip_date, start_time, end_time,
          point_count, valid_point_count, is_valid, source_file
        )
        SELECT
          trip_uid, source_trip_key, devid, trip_date, start_time, end_time,
          point_count, valid_point_count, is_valid, source_file
        FROM dedup
        ON CONFLICT (trip_uid) DO UPDATE SET
          source_trip_key = EXCLUDED.source_trip_key,
          devid = EXCLUDED.devid,
          trip_date = EXCLUDED.trip_date,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          point_count = EXCLUDED.point_count,
          valid_point_count = EXCLUDED.valid_point_count,
          is_valid = EXCLUDED.is_valid,
          source_file = EXCLUDED.source_file
        """
    )

    cur.execute(
        """
        SELECT d.trip_uid, tr.id
        FROM (
          SELECT DISTINCT ON (trip_uid) trip_uid
          FROM trips_stage
          ORDER BY trip_uid, stage_seq DESC
        ) d
        JOIN trips tr ON tr.trip_uid = d.trip_uid
        """
    )
    return {str(row[0]): int(row[1]) for row in cur.fetchall()}


def insert_raw_points(
    cur: psycopg.Cursor,
    trip_id: int,
    devid: str | None,
    lats: np.ndarray,
    lons: np.ndarray,
    speeds: np.ndarray,
    tms: np.ndarray,
) -> None:
    cur.execute("DELETE FROM trip_points_raw WHERE trip_id = %s", (trip_id,))
    rows = []
    for i in range(len(lats)):
        lat = float(lats[i])
        lon = float(lons[i])
        speed = float(speeds[i]) if i < len(speeds) else None
        ts = int(tms[i]) if i < len(tms) else None
        event_time = ts_to_dt(ts)
        is_valid = -90 <= lat <= 90 and -180 <= lon <= 180
        invalid_reason = None if is_valid else "invalid_coordinate"
        rows.append(
            (
                trip_id,
                i,
                event_time,
                ts,
                devid,
                lat,
                lon,
                speed,
                _ewkt_point(lon, lat),
                is_valid,
                invalid_reason,
            )
        )
    if rows:
        _copy_rows(
            cur,
            """
            COPY trip_points_raw (
              trip_id, point_seq, event_time, tms, devid, lat, lon, speed, geom, is_valid, invalid_reason
            ) FROM STDIN
            """,
            rows,
        )


def _set_session_tuning(cur: psycopg.Cursor) -> None:
    cur.execute("SET LOCAL synchronous_commit = off")
    cur.execute("SET LOCAL jit = off")
    cur.execute("SET LOCAL work_mem = '256MB'")
    cur.execute("SET LOCAL maintenance_work_mem = '1GB'")
    cur.execute("SET LOCAL max_parallel_workers_per_gather = 4")


def _flush_pending_trips(
    cur: psycopg.Cursor,
    pending_trips: list[PendingTrip],
    jld_file: h5py.File | None,
    trips_ds: Any,
    chunk_size: int,
    raw_buffer: list[tuple[Any, ...]],
    meta_buffer: list[tuple[Any, ...]],
    matched_buffer: list[tuple[Any, ...]],
    segment_buffer: list[tuple[Any, ...]],
    counts: dict[str, int],
    chunk_flushes: dict[str, int],
) -> None:
    if not pending_trips:
        return

    trip_map = upsert_trips_batch(cur, [p.trip for p in pending_trips])

    for pending in pending_trips:
        trip = pending.trip
        trip_id = trip_map[trip.trip_uid]
        counts["trips"] += 1

        for i in range(len(pending.lats)):
            lat = float(pending.lats[i])
            lon = float(pending.lons[i])
            speed = float(pending.speeds[i]) if i < len(pending.speeds) else None
            ts = int(pending.tms[i]) if i < len(pending.tms) else None
            event_time = ts_to_dt(ts)
            is_valid = -90 <= lat <= 90 and -180 <= lon <= 180
            invalid_reason = None if is_valid else "invalid_coordinate"
            raw_buffer.append(
                (
                    trip_id,
                    i,
                    event_time,
                    ts,
                    pending.devid,
                    lat,
                    lon,
                    speed,
                    _ewkt_point(lon, lat),
                    is_valid,
                    invalid_reason,
                )
            )
            if len(raw_buffer) >= chunk_size:
                counts["raw_points"] += _flush_copy_buffer(
                    cur,
                    """
                    COPY trip_points_raw (
                      trip_id, point_seq, event_time, tms, devid, lat, lon, speed, geom, is_valid, invalid_reason
                    ) FROM STDIN
                    """,
                    raw_buffer,
                )
                chunk_flushes["raw_points"] += 1

        if (
            jld_file is not None
            and trips_ds is not None
            and pending.idx < len(trips_ds)
        ):
            rec = jld_file[trips_ds[pending.idx]][()]
            meta_rows, matched_rows, segment_rows = _extract_jld_rows(
                trip_uid=trip.trip_uid,
                rec=rec,
                f=jld_file,
                default_tms=pending.tms,
                default_lats=pending.lats,
                default_lons=pending.lons,
            )

            for r in meta_rows:
                payload_raw = r.get("raw_payload")
                payload = json.loads(payload_raw) if payload_raw else None
                meta_buffer.append(
                    (
                        trip_id,
                        int(r.get("point_seq") or 0),
                        int(r.get("matched_seq") or 0),
                        _to_nullable_str(r.get("road_id")),
                        _to_nullable_str(r.get("road_name")),
                        _to_nullable_str(r.get("direction")),
                        bool(r.get("is_virtual") or False),
                        float(r["confidence"])
                        if r.get("confidence") is not None
                        else None,
                        float(r["segment_fraction"])
                        if r.get("segment_fraction") is not None
                        else None,
                        Json(payload),
                    )
                )
                if len(meta_buffer) >= chunk_size:
                    counts["match_meta"] += _flush_copy_buffer(
                        cur,
                        """
                        COPY trip_match_meta (
                          trip_id, point_seq, matched_seq, road_id, road_name, direction,
                          is_virtual, confidence, segment_fraction, raw_payload
                        ) FROM STDIN
                        """,
                        meta_buffer,
                    )
                    chunk_flushes["match_meta"] += 1

            for r in matched_rows:
                matched_buffer.append(
                    (
                        trip_id,
                        int(r.get("point_seq") or 0),
                        r.get("event_time"),
                        int(r["tms"]) if r.get("tms") is not None else None,
                        float(r["lat"]) if r.get("lat") is not None else None,
                        float(r["lon"]) if r.get("lon") is not None else None,
                        _to_nullable_str(r.get("geom_ewkt")),
                        _to_nullable_str(r.get("road_id")),
                        _to_nullable_str(r.get("road_name")),
                        float(r["matched_offset_m"])
                        if r.get("matched_offset_m") is not None
                        else None,
                        float(r["confidence"])
                        if r.get("confidence") is not None
                        else None,
                        bool(r.get("is_virtual") or False),
                    )
                )
                if len(matched_buffer) >= chunk_size:
                    counts["matched_points"] += _flush_copy_buffer(
                        cur,
                        """
                        COPY trip_points_matched (
                          trip_id, point_seq, event_time, tms, lat, lon, geom, road_id, road_name,
                          matched_offset_m, confidence, is_virtual
                        ) FROM STDIN
                        """,
                        matched_buffer,
                    )
                    chunk_flushes["matched_points"] += 1

            for r in segment_rows:
                segment_buffer.append(
                    (
                        trip_id,
                        int(r.get("segment_seq") or 0),
                        int(r.get("from_point_seq") or 0),
                        int(r.get("to_point_seq") or 0),
                        r.get("start_time"),
                        r.get("end_time"),
                        0.0,
                        float(r["duration_s"])
                        if r.get("duration_s") is not None
                        else None,
                        None,
                        _to_nullable_str(r.get("road_id")),
                        _to_nullable_str(r.get("road_name")),
                        float(r["start_lat"])
                        if r.get("start_lat") is not None
                        else None,
                        float(r["start_lon"])
                        if r.get("start_lon") is not None
                        else None,
                        float(r["end_lat"]) if r.get("end_lat") is not None else None,
                        float(r["end_lon"]) if r.get("end_lon") is not None else None,
                        _to_nullable_str(r.get("path_geom_ewkt")),
                    )
                )
                if len(segment_buffer) >= chunk_size:
                    counts["segments"] += _flush_copy_buffer(
                        cur,
                        """
                        COPY trip_segments (
                          trip_id, segment_seq, from_point_seq, to_point_seq, start_time, end_time,
                          distance_m, duration_s, avg_speed_kmh, road_id, road_name,
                          start_lat, start_lon, end_lat, end_lon, path_geom
                        ) FROM STDIN
                        """,
                        segment_buffer,
                    )
                    chunk_flushes["segments"] += 1

    pending_trips.clear()


def _ingest_one_file_task(
    h5_path_str: str,
    jld_path_str: str | None,
    max_trips: int | None,
    chunk_size: int,
    trip_upsert_batch_size: int,
    shard_id: int = 0,
    shard_count: int = 1,
) -> dict[str, Any]:
    h5_path = Path(h5_path_str)
    jld_path = Path(jld_path_str) if jld_path_str else None
    pid = os.getpid()
    started_at = datetime.now()

    counts = {
        "trips": 0,
        "raw_points": 0,
        "match_meta": 0,
        "matched_points": 0,
        "segments": 0,
    }

    with psycopg.connect(settings.db_conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL statement_timeout = 0")
            _set_session_tuning(cur)

            raw_buffer: list[tuple[Any, ...]] = []
            meta_buffer: list[tuple[Any, ...]] = []
            matched_buffer: list[tuple[Any, ...]] = []
            segment_buffer: list[tuple[Any, ...]] = []

            with h5py.File(h5_path, "r") as h5:
                trip_group = h5["trip"]
                trip_keys = sorted(
                    trip_group.keys(), key=lambda x: int(x) if x.isdigit() else x
                )
                n = len(trip_keys)
                if max_trips is not None:
                    n = min(n, max_trips)

                trips_ds = None
                jld_file = None
                if jld_path and jld_path.exists():
                    jld_file = h5py.File(jld_path, "r")
                    trips_ds = jld_file["trips"]

                chunk_flushes = {
                    "raw_points": 0,
                    "match_meta": 0,
                    "matched_points": 0,
                    "segments": 0,
                }

                try:
                    mark = max(1, n // 20) if n else 1
                    pending_trips: list[PendingTrip] = []
                    idx_iter: Iterable[int]
                    if shard_count > 1:
                        idx_iter = range(shard_id, n, shard_count)
                    else:
                        idx_iter = range(n)

                    for idx in idx_iter:
                        source_trip_key = trip_keys[idx]
                        g = trip_group[source_trip_key]

                        devid = str(int(g["devid"][()]))
                        lats = g["lat"][()]
                        lons = g["lon"][()]
                        speeds = (
                            g["speed"][()]
                            if "speed" in g
                            else np.array([], dtype=float)
                        )
                        tms = g["tms"][()]

                        start_time = ts_to_dt(tms[0]) if len(tms) else None
                        end_time = ts_to_dt(tms[-1]) if len(tms) else None
                        trip_date = (
                            start_time.date().isoformat() if start_time else None
                        )
                        trip_uid = f"{h5_path.stem}:{source_trip_key}"

                        trip = TripRow(
                            trip_uid=trip_uid,
                            source_trip_key=source_trip_key,
                            devid=devid,
                            trip_date=trip_date,
                            start_time=start_time,
                            end_time=end_time,
                            point_count=len(lats),
                            valid_point_count=len(lats),
                            is_valid=True,
                            source_file=h5_path.name,
                        )
                        pending_trips.append(
                            PendingTrip(
                                idx=idx,
                                trip=trip,
                                devid=devid,
                                lats=lats,
                                lons=lons,
                                speeds=speeds,
                                tms=tms,
                            )
                        )
                        if len(pending_trips) >= trip_upsert_batch_size:
                            _flush_pending_trips(
                                cur=cur,
                                pending_trips=pending_trips,
                                jld_file=jld_file,
                                trips_ds=trips_ds,
                                chunk_size=chunk_size,
                                raw_buffer=raw_buffer,
                                meta_buffer=meta_buffer,
                                matched_buffer=matched_buffer,
                                segment_buffer=segment_buffer,
                                counts=counts,
                                chunk_flushes=chunk_flushes,
                            )

                        if (idx + 1) % mark == 0 or idx + 1 == n:
                            pct = ((idx + 1) / n) * 100 if n else 100.0
                            print(
                                f"[step1/3][worker:{pid}][shard:{shard_id + 1}/{shard_count}] {h5_path.name}: {idx + 1}/{n} ({pct:.1f}%)",
                                flush=True,
                            )

                    _flush_pending_trips(
                        cur=cur,
                        pending_trips=pending_trips,
                        jld_file=jld_file,
                        trips_ds=trips_ds,
                        chunk_size=chunk_size,
                        raw_buffer=raw_buffer,
                        meta_buffer=meta_buffer,
                        matched_buffer=matched_buffer,
                        segment_buffer=segment_buffer,
                        counts=counts,
                        chunk_flushes=chunk_flushes,
                    )

                    flushed = _flush_copy_buffer(
                        cur,
                        """
                        COPY trip_points_raw (
                          trip_id, point_seq, event_time, tms, devid, lat, lon, speed, geom, is_valid, invalid_reason
                        ) FROM STDIN
                        """,
                        raw_buffer,
                    )
                    counts["raw_points"] += flushed
                    if flushed > 0:
                        chunk_flushes["raw_points"] += 1

                    flushed = _flush_copy_buffer(
                        cur,
                        """
                        COPY trip_match_meta (
                          trip_id, point_seq, matched_seq, road_id, road_name, direction,
                          is_virtual, confidence, segment_fraction, raw_payload
                        ) FROM STDIN
                        """,
                        meta_buffer,
                    )
                    counts["match_meta"] += flushed
                    if flushed > 0:
                        chunk_flushes["match_meta"] += 1

                    flushed = _flush_copy_buffer(
                        cur,
                        """
                        COPY trip_points_matched (
                          trip_id, point_seq, event_time, tms, lat, lon, geom, road_id, road_name,
                          matched_offset_m, confidence, is_virtual
                        ) FROM STDIN
                        """,
                        matched_buffer,
                    )
                    counts["matched_points"] += flushed
                    if flushed > 0:
                        chunk_flushes["matched_points"] += 1

                    flushed = _flush_copy_buffer(
                        cur,
                        """
                        COPY trip_segments (
                          trip_id, segment_seq, from_point_seq, to_point_seq, start_time, end_time,
                          distance_m, duration_s, avg_speed_kmh, road_id, road_name,
                          start_lat, start_lon, end_lat, end_lon, path_geom
                        ) FROM STDIN
                        """,
                        segment_buffer,
                    )
                    counts["segments"] += flushed
                    if flushed > 0:
                        chunk_flushes["segments"] += 1

                    print(
                        f"[step1/3][worker:{pid}] flushes file={h5_path.name} chunks={chunk_flushes}",
                        flush=True,
                    )
                    conn.commit()
                finally:
                    if jld_file is not None:
                        jld_file.close()

    return {
        "file": h5_path.name,
        "pid": pid,
        "counts": counts,
        "chunk_flushes": chunk_flushes,
        "elapsed_s": (datetime.now() - started_at).total_seconds(),
    }


def source_file_pairs(
    base_dir: Path, source_key: str | None = None
) -> list[tuple[Path, Path | None]]:
    data_dir = base_dir / "data"
    jld_dir = base_dir / "jldpath"
    h5_files = sorted(data_dir.glob("trips_*.h5"))
    jld_files = {p.stem.replace("trips_", ""): p for p in jld_dir.glob("trips_*.jld2")}
    pairs: list[tuple[Path, Path | None]] = []
    for h5_path in h5_files:
        key = h5_path.stem.replace("trips_", "")
        if source_key and key != source_key:
            continue
        pairs.append((h5_path, jld_files.get(key)))
    return pairs


def ingest_sources_parallel(
    *,
    base_dir: Path,
    max_trips: int | None,
    chunk_size: int,
    workers: int | None,
    trip_upsert_batch_size: int,
    source_key: str | None,
    file_shards: int,
    progress_fn: Any,
) -> dict[str, int]:
    pairs = source_file_pairs(base_dir, source_key=source_key)
    if not pairs:
        return {
            "trips": 0,
            "raw_points": 0,
            "match_meta": 0,
            "matched_points": 0,
            "segments": 0,
        }

    dispatch_units = len(pairs) * max(1, file_shards)
    max_workers = workers or max(1, min(dispatch_units, (os.cpu_count() or 1)))
    progress_fn(
        "step1/3",
        f"dispatch files={len(pairs)}, shards={file_shards}, workers={max_workers}, chunk={chunk_size}",
    )

    results: list[dict[str, int]] = []
    with ProcessPoolExecutor(max_workers=max_workers) as pool:
        futures = []
        for h5_path, jld_path in pairs:
            for shard_id in range(max(1, file_shards)):
                futures.append(
                    pool.submit(
                        _ingest_one_file_task,
                        str(h5_path),
                        str(jld_path) if jld_path else None,
                        max_trips,
                        chunk_size,
                        trip_upsert_batch_size,
                        shard_id,
                        max(1, file_shards),
                    )
                )

        for fut in as_completed(futures):
            result = fut.result()
            file_name = str(result["file"])
            pid = int(result["pid"])
            counts = result["counts"]
            elapsed_s = float(result.get("elapsed_s") or 0.0)
            results.append(counts)
            progress_fn(
                "step1/3",
                f"done file={file_name} pid={pid} rows={counts} elapsed={elapsed_s:.1f}s",
            )

    total = {
        "trips": 0,
        "raw_points": 0,
        "match_meta": 0,
        "matched_points": 0,
        "segments": 0,
    }
    for counts in results:
        for key in total:
            total[key] += int(counts.get(key, 0))
    return total
