import os
from collections.abc import Iterator
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from typing import LiteralString, cast
from psycopg import sql

from app.services.ingest_service import (
    create_ingest_hot_indexes,
    drop_ingest_hot_indexes,
    finalize_pipeline_run_failure,
    finalize_pipeline_run_success,
    release_rebuild_lock,
    start_pipeline_run,
    source_file_pairs,
    truncate_ingest_detail_tables,
    try_acquire_rebuild_lock,
)


def _build_test_db_name() -> str:
    return f"harbin_ingest_test_{uuid4().hex[:10]}"


def _admin_conninfo() -> str:
    db_user = os.getenv("DB_USER", "postgres")
    db_password = os.getenv("DB_PASSWORD", "postgres")
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "5432")
    return os.environ.get(
        "DB_ADMIN_CONNINFO",
        f"dbname=postgres user={db_user} password={db_password} host={db_host} port={db_port}",
    )


def _test_conninfo(db_name: str) -> str:
    db_user = os.getenv("DB_USER", "postgres")
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "5432")
    return f"dbname={db_name} user={db_user} host={db_host} port={db_port}"


def _apply_schema(conninfo: str) -> None:
    sql_dir = Path(__file__).resolve().parents[2] / "infra" / "postgres"
    with psycopg.connect(conninfo) as conn:
        with conn.cursor() as cur:
            for name in ("init.sql", "ingest_schema.sql", "stats_schema.sql"):
                schema_sql = cast(
                    LiteralString, (sql_dir / name).read_text(encoding="utf-8")
                )
                cur.execute(schema_sql)
        conn.commit()


@pytest.fixture(scope="module")
def ingest_test_conninfo() -> Iterator[str]:
    db_name = _build_test_db_name()
    conninfo = _test_conninfo(db_name)

    with psycopg.connect(_admin_conninfo(), autocommit=True) as admin_conn:
        with admin_conn.cursor() as cur:
            cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db_name)))

    try:
        _apply_schema(conninfo)
        yield conninfo
    finally:
        with psycopg.connect(_admin_conninfo(), autocommit=True) as admin_conn:
            with admin_conn.cursor() as cur:
                cur.execute(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s",
                    (db_name,),
                )
                cur.execute(
                    sql.SQL("DROP DATABASE IF EXISTS {}").format(
                        sql.Identifier(db_name)
                    )
                )


def test_ingest_run_lifecycle(ingest_test_conninfo: str) -> None:
    with psycopg.connect(ingest_test_conninfo) as conn:
        with conn.cursor() as cur:
            run_id = start_pipeline_run(
                cur,
                mode="rebuild",
                source_file="h5+jld2",
                max_trips=123,
            )
            finalize_pipeline_run_success(
                cur,
                run_id=run_id,
                mode="rebuild",
                ingest_counts={
                    "trips": 2,
                    "raw_points": 5,
                    "match_meta": 5,
                    "matched_points": 5,
                    "segments": 3,
                },
                chunk_size=100,
                workers=2,
                trip_upsert_batch_size=50,
                source_key="150103",
                file_shards=1,
                pg_fast_mode=False,
            )
        conn.commit()

    with psycopg.connect(ingest_test_conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, row_count, error_message FROM ingest_runs WHERE id = (SELECT MAX(id) FROM ingest_runs)"
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "success"
            assert row[1] == 20
            assert row[2] is None


def test_ingest_run_failure_status(ingest_test_conninfo: str) -> None:
    with psycopg.connect(ingest_test_conninfo) as conn:
        with conn.cursor() as cur:
            run_id = start_pipeline_run(
                cur,
                mode="rebuild",
                source_file="h5+jld2",
                max_trips=None,
            )
            finalize_pipeline_run_failure(
                cur,
                run_id=run_id,
                error_message="unit-test failure",
            )
        conn.commit()

    with psycopg.connect(ingest_test_conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, error_message FROM ingest_runs WHERE id = (SELECT MAX(id) FROM ingest_runs)"
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "failed"
            assert row[1] == "unit-test failure"


def test_rebuild_lock_roundtrip(ingest_test_conninfo: str) -> None:
    lock_key = 998877
    with psycopg.connect(ingest_test_conninfo) as conn1:
        with conn1.cursor() as cur1:
            assert try_acquire_rebuild_lock(cur1, lock_key) is True
            with psycopg.connect(ingest_test_conninfo) as conn2:
                with conn2.cursor() as cur2:
                    assert try_acquire_rebuild_lock(cur2, lock_key) is False
            release_rebuild_lock(cur1, lock_key)
            assert try_acquire_rebuild_lock(cur1, lock_key) is True
            release_rebuild_lock(cur1, lock_key)


def test_truncate_and_hot_indexes(ingest_test_conninfo: str) -> None:
    with psycopg.connect(ingest_test_conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO trips (
                  trip_uid, source_trip_key, devid, trip_date,
                  start_time, end_time, point_count, valid_point_count, is_valid, source_file
                ) VALUES (
                  'ing:t1', '1', 'v1', '2015-01-03',
                  '2015-01-03 08:00:00', '2015-01-03 08:05:00', 2, 2, true, 'seed'
                )
                """
            )
            cur.execute("SELECT id FROM trips WHERE trip_uid = 'ing:t1'")
            row = cur.fetchone()
            assert row is not None
            trip_id = int(row[0])

            cur.execute(
                """
                INSERT INTO trip_points_raw (
                  trip_id, point_seq, event_time, tms, devid, lat, lon, speed, geom, is_valid
                ) VALUES (
                  %s, 0, '2015-01-03 08:00:00', 1420243200, 'v1',
                  45.756, 126.642, 30, ST_SetSRID(ST_MakePoint(126.642, 45.756), 4326), true
                )
                """,
                (trip_id,),
            )
            cur.execute(
                """
                INSERT INTO trip_match_meta (
                  trip_id, point_seq, matched_seq, road_id, road_name, direction, is_virtual,
                  confidence, segment_fraction, raw_payload
                ) VALUES (
                  %s, 0, 0, 'r1', 'Road 1', 'N', false, 0.9, 0.1, '{}'::jsonb
                )
                """,
                (trip_id,),
            )
            cur.execute(
                """
                INSERT INTO trip_points_matched (
                  trip_id, point_seq, event_time, tms, lat, lon, geom, road_id, road_name, matched_offset_m,
                  confidence, is_virtual
                ) VALUES (
                  %s, 0, '2015-01-03 08:00:00', 1420243200, 45.756, 126.642,
                  ST_SetSRID(ST_MakePoint(126.642, 45.756), 4326), 'r1', 'Road 1', 0, 0.9, false
                )
                """,
                (trip_id,),
            )
            cur.execute(
                """
                INSERT INTO trip_segments (
                  trip_id, segment_seq, from_point_seq, to_point_seq, start_time, end_time,
                  distance_m, duration_s, avg_speed_kmh, road_id, road_name,
                  start_lat, start_lon, end_lat, end_lon, path_geom
                ) VALUES (
                  %s, 0, 0, 1, '2015-01-03 08:00:00', '2015-01-03 08:05:00',
                  3000, 300, 36, 'r1', 'Road 1',
                  45.756, 126.642, 45.740, 126.620,
                  ST_GeomFromText('LINESTRING(126.642 45.756,126.620 45.740)', 4326)
                )
                """,
                (trip_id,),
            )

            truncate_ingest_detail_tables(cur)
            cur.execute(
                """
                SELECT
                  (SELECT COUNT(*) FROM trips),
                  (SELECT COUNT(*) FROM trip_points_raw),
                  (SELECT COUNT(*) FROM trip_match_meta),
                  (SELECT COUNT(*) FROM trip_points_matched),
                  (SELECT COUNT(*) FROM trip_segments)
                """
            )
            row = cur.fetchone()
            assert row is not None
            assert row == (0, 0, 0, 0, 0)

            drop_ingest_hot_indexes(cur)
            create_ingest_hot_indexes(cur)
            cur.execute(
                """
                SELECT COUNT(*)
                FROM pg_indexes
                WHERE tablename = 'trip_points_raw' AND indexname = 'idx_raw_trip_seq'
                """
            )
            idx_row = cur.fetchone()
            assert idx_row is not None
            assert idx_row[0] == 1
        conn.commit()


def test_source_file_pairs_reads_h5_jld_mapping(tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    jld_dir = tmp_path / "jldpath"
    data_dir.mkdir(parents=True)
    jld_dir.mkdir(parents=True)

    (data_dir / "trips_150103.h5").write_bytes(b"")
    (data_dir / "trips_150104.h5").write_bytes(b"")
    (jld_dir / "trips_150103.jld2").write_bytes(b"")

    pairs = source_file_pairs(tmp_path)
    assert len(pairs) == 2

    mapped = {h5.name: (jld.name if jld else None) for h5, jld in pairs}
    assert mapped["trips_150103.h5"] == "trips_150103.jld2"
    assert mapped["trips_150104.h5"] is None

    filtered = source_file_pairs(tmp_path, source_key="150104")
    assert len(filtered) == 1
    assert filtered[0][0].name == "trips_150104.h5"
    assert filtered[0][1] is None
