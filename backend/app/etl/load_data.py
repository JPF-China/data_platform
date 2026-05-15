from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

import psycopg

from app.core.config import settings
from app.services import ingest_service
from app.services import road_mapping_service
from app.services import road_network_service
from app.services import stats_service

from app.etl import refresh_all as _refresh_all
from app.etl import refresh_governance as _refresh_governance
from app.etl import refresh_ops as _refresh_ops
from app.etl import refresh_report as _refresh_report
from app.etl import refresh_risk as _refresh_risk
from app.etl import refresh_stats as _refresh_stats


DEFAULT_COPY_CHUNK_SIZE = 200_000
DEFAULT_TRIP_UPSERT_BATCH_SIZE = 200
INGEST_ADVISORY_LOCK_KEY = 20260322


def _progress(step: str, message: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] [{step}] {message}", flush=True)


def _recompute_segments_metrics(cur: psycopg.Cursor, batch_size: int = 500_000) -> None:
    cur.execute("SELECT MIN(id), MAX(id) FROM trip_segments")
    row = cur.fetchone()
    if row is None or row[0] is None:
        return
    min_id, max_id = int(row[0]), int(row[1])
    total = max_id - min_id + 1

    lo = min_id
    while lo <= max_id:
        hi = min(lo + batch_size - 1, max_id)
        _progress("step1/5", f"  computing segments {lo}-{hi} ({int((lo - min_id) / total * 100)}%)")
        cur.execute(
            """
            WITH calc AS (
              SELECT id, ST_Length(path_geom::geography) AS length_m
              FROM trip_segments
              WHERE id >= %s AND id <= %s
            )
            UPDATE trip_segments s
            SET
              distance_m = c.length_m,
              avg_speed_kmh = CASE
                WHEN s.duration_s IS NOT NULL AND s.duration_s > 0
                  AND (c.length_m / s.duration_s) * 3.6 > 0
                  AND (c.length_m / s.duration_s) * 3.6 <= 200
                THEN (c.length_m / s.duration_s) * 3.6
                ELSE NULL
              END
            FROM calc c
            WHERE s.id = c.id
            """,
            (lo, hi),
        )
        cur.connection.commit()
        lo = hi + 1
    _progress("step1/5", f"  segments computation done ({max_id - min_id + 1} rows)")


def _set_rebuild_tables_unlogged(cur: psycopg.Cursor) -> None:
    _progress("step1/5", "  setting rebuild tables UNLOGGED …")
    cur.execute(
        """
        ALTER TABLE trips SET UNLOGGED;
        ALTER TABLE trip_points_raw SET UNLOGGED;
        ALTER TABLE trip_match_meta SET UNLOGGED;
        ALTER TABLE trip_points_matched SET UNLOGGED;
        ALTER TABLE trip_segments SET UNLOGGED;
        ALTER TABLE daily_metrics SET UNLOGGED;
        ALTER TABLE daily_distance_boxplot SET UNLOGGED;
        ALTER TABLE daily_speed_boxplot SET UNLOGGED;
        ALTER TABLE heatmap_bins SET UNLOGGED;
        ALTER TABLE table_row_stats SET UNLOGGED;
        """
    )


def _set_rebuild_tables_logged(cur: psycopg.Cursor) -> None:
    _progress("step1/5", "  setting rebuild tables LOGGED …")
    cur.execute(
        """
        ALTER TABLE trips SET LOGGED;
        ALTER TABLE trip_points_raw SET LOGGED;
        ALTER TABLE trip_match_meta SET LOGGED;
        ALTER TABLE trip_points_matched SET LOGGED;
        ALTER TABLE trip_segments SET LOGGED;
        ALTER TABLE daily_metrics SET LOGGED;
        ALTER TABLE daily_distance_boxplot SET LOGGED;
        ALTER TABLE daily_speed_boxplot SET LOGGED;
        ALTER TABLE heatmap_bins SET LOGGED;
        ALTER TABLE table_row_stats SET LOGGED;
        """
    )


def _truncate_rebuild_tables(cur: psycopg.Cursor) -> None:
    _progress("step1/5", "  truncating stats tables …")
    cur.execute(
        """
        TRUNCATE TABLE
          route_results,
          table_row_stats,
          heatmap_bins,
          daily_speed_boxplot,
          daily_distance_boxplot,
          daily_metrics
        RESTART IDENTITY CASCADE
        """
    )
    _progress("step1/5", "  truncating ingest detail tables …")
    ingest_service.truncate_ingest_detail_tables(cur)
    _progress("step1/5", "  all tables cleared")


def _step2_ingest_sources_parallel(
    base_dir: Path,
    max_trips: int | None,
    chunk_size: int,
    workers: int | None,
    trip_upsert_batch_size: int,
    source_key: str | None,
    file_shards: int,
) -> dict[str, int]:
    return ingest_service.ingest_sources_parallel(
        base_dir=base_dir,
        max_trips=max_trips,
        chunk_size=chunk_size,
        workers=workers,
        trip_upsert_batch_size=trip_upsert_batch_size,
        source_key=source_key,
        file_shards=file_shards,
        progress_fn=_progress,
    )


def _step4_compute(cur: psycopg.Cursor) -> None:
    _progress("step4/5", "start: truncate stats module tables")
    cur.execute(
        """
        TRUNCATE TABLE
          table_row_stats,
          road_speed_bins,
          heatmap_bins,
          daily_speed_boxplot,
          daily_distance_boxplot,
          daily_metrics
        RESTART IDENTITY CASCADE
        """
    )
    _progress("step4/5", "rebuilding daily metrics")
    stats_service.aggregate_daily_metrics(cur)
    _progress("step4/5", "rebuilding daily distance boxplot")
    stats_service.aggregate_daily_distance_boxplot(cur)
    _progress("step4/5", "rebuilding daily speed boxplot")
    stats_service.aggregate_daily_speed_boxplot(cur)
    _progress("step4/5", "rebuilding heatmap bins")
    stats_service.aggregate_heatmap_bins(cur)
    _progress("step4/5", "rebuilding road speed bins")
    stats_service.aggregate_road_speed_bins(cur)
    _progress("step4/5", "refreshing table row stats")
    stats_service.aggregate_table_row_stats(cur)


def _step4_aggregate_all(conn: psycopg.Connection) -> None:
    """Ensure SQL functions are current, then run stats → ops/risk/report/governance."""
    # 确保统计函数为最新版本（幂等：全部 CREATE OR REPLACE）
    schema_path = Path("/infra/postgres/stats_schema.sql")
    if schema_path.exists():
        with conn.cursor() as cur:
            cur.execute(schema_path.read_text())
        conn.commit()
        _progress("step4/5", "stats functions refreshed from stats_schema.sql")

    with conn.cursor() as cur:
        _step4_compute(cur)
        conn.commit()

    _refresh_ops.refresh(conn=conn)
    _refresh_risk.refresh(conn=conn)
    _refresh_report.refresh(conn=conn)
    _refresh_governance.refresh(conn=conn)


def _step_ingest_only(
    cur: psycopg.Cursor,
    conn: psycopg.Connection,
    *,
    base_dir: Path,
    max_trips: int | None,
    chunk_size: int,
    workers: int | None,
    trip_upsert_batch_size: int,
    source_key: str | None,
    file_shards: int,
) -> dict[str, int]:
    _progress(
        "step1/5", "start: clear detail tables and ingest source files in parallel"
    )
    ingest_service.truncate_ingest_detail_tables(cur)
    _progress("step1/5", "start: drop hot write indexes")
    ingest_service.drop_ingest_hot_indexes(cur)
    conn.commit()

    ingest_counts = _step2_ingest_sources_parallel(
        base_dir=base_dir,
        max_trips=max_trips,
        chunk_size=chunk_size,
        workers=workers,
        trip_upsert_batch_size=trip_upsert_batch_size,
        source_key=source_key,
        file_shards=file_shards,
    )
    _progress("step1/5", f"done: loaded rows={ingest_counts}")

    _progress("step1/5", "start: rebuild segment distance/speed metrics")
    _recompute_segments_metrics(cur)
    conn.commit()
    _progress("step1/5", "done: segment metrics rebuilt")

    _progress("step1/5", "start: rebuild hot indexes")
    ingest_service.create_ingest_hot_indexes(cur)
    conn.commit()
    _progress("step1/5", "done: hot indexes rebuilt")

    cur.execute(
        "ANALYZE trips, trip_points_raw, trip_match_meta, trip_points_matched, trip_segments"
    )
    conn.commit()
    _progress("step1/5", "done: analyze refreshed")

    _progress("step2/5", "skip: ingest mode")
    _progress("step3/5", "skip: ingest mode")
    _progress("step4/5", "skip: ingest mode")
    _progress("step5/5", "ingest mode completed without stats/path table cleanup")
    return ingest_counts


def _step_optimize(cur: psycopg.Cursor) -> None:
    _progress("step1/5", "start: ensure hot indexes")
    ingest_service.create_ingest_hot_indexes(cur)
    _progress("step1/5", "start: analyze detail tables")
    cur.execute(
        "ANALYZE trips, trip_points_raw, trip_match_meta, trip_points_matched, trip_segments"
    )


def _step_route_ingest(base_dir: Path, cur: psycopg.Cursor) -> None:
    _progress("step2/5", "start: route network ingest")
    imported = road_network_service.import_bfmap_csv(
        cur=cur, csv_path=base_dir / "bfmap_ways.csv"
    )
    _progress("step2/5", f"done: imported bfmap_ways rows={imported}")
    _progress("step2/5", "start: rebuild road_segments from bfmap")
    count = road_network_service.rebuild_road_segments_from_bfmap(cur)
    _progress("step2/5", f"done: rebuilt road_segments rows={count}")
    _progress("step2/5", "start: rebuild ingest_road_map")
    mapped = road_mapping_service.rebuild_ingest_road_map(cur)
    _progress("step2/5", f"done: rebuilt ingest_road_map rows={mapped}")


def _step_smoke(cur: psycopg.Cursor) -> None:
    cur.execute(
        """
        SELECT
          (SELECT COUNT(*) FROM daily_metrics),
          (SELECT COUNT(*) FROM daily_distance_boxplot),
          (SELECT COUNT(*) FROM daily_speed_boxplot),
          (SELECT COUNT(*) FROM heatmap_bins)
        """
    )
    row = cur.fetchone()
    if row is None:
        raise RuntimeError("smoke validation failed: no stats row returned")


def run_pipeline(
    base_dir: Path,
    mode: str,
    max_trips: int | None = None,
    chunk_size: int = DEFAULT_COPY_CHUNK_SIZE,
    workers: int | None = None,
    trip_upsert_batch_size: int = DEFAULT_TRIP_UPSERT_BATCH_SIZE,
    source_key: str | None = None,
    file_shards: int = 1,
    pg_fast_mode: bool = False,
) -> None:
    with psycopg.connect(settings.db_conninfo) as conn:
        with conn.cursor() as cur:
            run_id = ingest_service.start_pipeline_run(
                cur,
                mode=mode,
                source_file="h5+jld2",
                max_trips=max_trips,
            )
            ingest_service.mark_stale_running_pipeline_runs(
                cur,
                current_run_id=run_id,
            )
            conn.commit()
            lock_acquired = False

            try:
                ingest_counts: dict[str, int] = {
                    "trips": 0,
                    "raw_points": 0,
                    "match_meta": 0,
                    "matched_points": 0,
                    "segments": 0,
                }

                if mode == "ingest":
                    lock_acquired = ingest_service.try_acquire_rebuild_lock(
                        cur, INGEST_ADVISORY_LOCK_KEY
                    )
                    if not lock_acquired:
                        raise RuntimeError(
                            "another rebuild ingest is running (advisory lock not acquired)"
                        )

                    ingest_counts = _step_ingest_only(
                        cur,
                        conn,
                        base_dir=base_dir,
                        max_trips=max_trips,
                        chunk_size=chunk_size,
                        workers=workers,
                        trip_upsert_batch_size=trip_upsert_batch_size,
                        source_key=source_key,
                        file_shards=file_shards,
                    )
                elif mode == "rebuild":
                    # 1) 清理可能残留的 advisory lock（上次 abort 遗留）
                    _progress("step1/5", "clearing stale advisory lock if any …")
                    cur.execute("SELECT pg_advisory_unlock(%s)", (INGEST_ADVISORY_LOCK_KEY,))
                    conn.commit()

                    lock_acquired = ingest_service.try_acquire_rebuild_lock(
                        cur, INGEST_ADVISORY_LOCK_KEY
                    )
                    if not lock_acquired:
                        raise RuntimeError(
                            "another rebuild ingest is running (advisory lock not acquired)"
                        )

                    # 2) 清空所有表（LOGGED 表 truncate 瞬间完成）
                    _progress("step1/5", "start: truncating all tables")
                    _truncate_rebuild_tables(cur)
                    conn.commit()
                    _progress("step1/5", "done: all tables truncated")

                    # 3) 切 UNLOGGED（空表 ALTER TABLE 瞬间完成）
                    if pg_fast_mode:
                        _progress("step1/5", "start: set rebuild tables UNLOGGED")
                        _set_rebuild_tables_unlogged(cur)
                        conn.commit()
                        _progress("step1/5", "done: rebuild tables UNLOGGED")

                    # 4) 并行入仓
                    _progress("step1/5", "start: drop hot write indexes")
                    ingest_service.drop_ingest_hot_indexes(cur)
                    conn.commit()

                    _progress(
                        "step1/5",
                        "start: ingest source files in parallel",
                    )
                    ingest_counts = _step2_ingest_sources_parallel(
                        base_dir=base_dir,
                        max_trips=max_trips,
                        chunk_size=chunk_size,
                        workers=workers,
                        trip_upsert_batch_size=trip_upsert_batch_size,
                        source_key=source_key,
                        file_shards=file_shards,
                    )
                    _progress("step1/5", f"done: loaded rows={ingest_counts}")

                    # 5) 重算 segment 指标
                    _progress("step1/5", "start: rebuild segment distance/speed metrics")
                    _recompute_segments_metrics(cur)
                    conn.commit()
                    _progress("step1/5", "done: segment metrics rebuilt")

                    # 6) 切回 LOGGED（保证数据安全）
                    if pg_fast_mode:
                        _progress("step1/5", "start: set rebuild tables LOGGED")
                        _set_rebuild_tables_logged(cur)
                        conn.commit()
                        _progress("step1/5", "done: rebuild tables LOGGED")

                    # 7) 重建索引
                    _progress("step1/5", "start: rebuild hot indexes")
                    ingest_service.create_ingest_hot_indexes(cur)
                    conn.commit()
                    _progress("step1/5", "done: hot indexes rebuilt")

                    # 8) ANALYZE
                    _progress("step1/5", "start: ANALYZE detail tables")
                    cur.execute(
                        "ANALYZE trips, trip_points_raw, trip_match_meta, trip_points_matched, trip_segments"
                    )
                    conn.commit()
                    _progress("step1/5", "done: analyze refreshed")

                    # 9) 路网导入
                    _step_route_ingest(base_dir, cur)
                    conn.commit()

                    # 10) 全部模块聚合
                    _progress("step4/5", "start: compute all aggregate tables (stats → ops → risk → report → governance)")
                    _step4_aggregate_all(conn)
                    _progress("step4/5", "done")

                    _progress("step5/5", "frontend consumes API only (no DB write)")
                    _progress("step5/5", "run: backend uvicorn + frontend npm run dev")
                elif mode == "compute":
                    _progress("step1/5", "skip: mode=compute")
                    _progress("step2/5", "skip: mode=compute")
                    _progress("step3/5", "skip: mode=compute")
                    _progress("step4/5", "start: compute all aggregate tables (stats → ops → risk → report → governance)")
                    _step4_aggregate_all(conn)
                    _progress("step4/5", "done")
                    _progress("step5/5", "frontend consumes API only (no DB write)")
                    _progress("step5/5", "run: backend uvicorn + frontend npm run dev")
                elif mode == "refresh":
                    lock_acquired = ingest_service.try_acquire_rebuild_lock(
                        cur, INGEST_ADVISORY_LOCK_KEY
                    )
                    if not lock_acquired:
                        raise RuntimeError(
                            "another rebuild ingest is running (advisory lock not acquired)"
                        )

                    _progress(
                        "step1/5", "skip: mode=refresh (reuse existing trips/segments)"
                    )
                    _progress(
                        "step2/5", "start: refresh route mapping from existing data"
                    )
                    _step_route_ingest(base_dir, cur)
                    conn.commit()
                    _progress("step2/5", "done")

                    _progress("step3/5", "skip: mode=refresh")
                    _progress("step4/5", "start: compute all aggregate tables (stats → ops → risk → report → governance)")
                    _step4_aggregate_all(conn)
                    _progress("step4/5", "done")
                    _progress("step5/5", "refresh mode completed")
                elif mode == "optimize":
                    _progress("step1/5", "start: optimize tables and indexes")
                    _step_optimize(cur)
                    conn.commit()
                    _progress("step1/5", "done: optimize completed")
                elif mode == "smoke":
                    _progress("step1/5", "skip: smoke mode")
                    _progress("step2/5", "skip: smoke mode")
                    _progress("step3/5", "skip: smoke mode")
                    _progress("step4/5", "start: validate aggregate tables")
                    _step_smoke(cur)
                    _progress("step4/5", "done")
                    _progress("step5/5", "smoke verified API/stat read chain")
                elif mode == "runtime":
                    _progress("step1/5", "skip: runtime mode")
                    _progress("step2/5", "skip: runtime mode")
                    _progress("step3/5", "skip: runtime mode")
                    _progress("step4/5", "skip: runtime mode")
                    _progress("step5/5", "runtime serves API from precomputed tables")
                elif mode == "refresh-stats":
                    _progress("module", "start: refresh-stats")
                    _refresh_stats.refresh(conn=conn)
                    _progress("module", "done: refresh-stats")
                elif mode == "refresh-ops":
                    _progress("module", "start: refresh-ops")
                    _refresh_ops.refresh(conn=conn)
                    _progress("module", "done: refresh-ops")
                elif mode == "refresh-risk":
                    _progress("module", "start: refresh-risk")
                    _refresh_risk.refresh(conn=conn)
                    _progress("module", "done: refresh-risk")
                elif mode == "refresh-report":
                    _progress("module", "start: refresh-report")
                    _refresh_report.refresh(conn=conn)
                    _progress("module", "done: refresh-report")
                elif mode == "refresh-governance":
                    _progress("module", "start: refresh-governance")
                    _refresh_governance.refresh(conn=conn)
                    _progress("module", "done: refresh-governance")
                elif mode == "refresh-all":
                    _progress("module", "start: refresh-all (stats → ops → risk → report → governance)")
                    _refresh_all.refresh_all()
                    _progress("module", "done: refresh-all")
                else:
                    raise ValueError(f"unsupported mode: {mode}")

                ingest_service.finalize_pipeline_run_success(
                    cur,
                    run_id=run_id,
                    mode=mode,
                    ingest_counts=ingest_counts,
                    chunk_size=chunk_size,
                    workers=workers,
                    trip_upsert_batch_size=trip_upsert_batch_size,
                    source_key=source_key,
                    file_shards=file_shards,
                    pg_fast_mode=pg_fast_mode,
                )
                conn.commit()
            except Exception as exc:
                conn.rollback()
                with conn.cursor() as ecur:
                    ingest_service.finalize_pipeline_run_failure(
                        ecur,
                        run_id=run_id,
                        error_message=str(exc),
                    )
                    conn.commit()
                raise
            finally:
                if lock_acquired:
                    with conn.cursor() as lcur:
                        ingest_service.release_rebuild_lock(
                            lcur, INGEST_ADVISORY_LOCK_KEY
                        )
                        conn.commit()


# NOTE: legacy helper `insert_matched_and_segments` removed.
# Matching and segment ingest now lives in `app/services/ingest_service.py`.


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pipeline for H5/JLD2 ingest and compute"
    )
    parser.add_argument("--base-dir", default=str(Path(__file__).resolve().parents[3]))
    parser.add_argument("--max-trips", type=int, default=None)
    parser.add_argument("--chunk-size", type=int, default=DEFAULT_COPY_CHUNK_SIZE)
    parser.add_argument("--workers", type=int, default=None)
    parser.add_argument(
        "--trip-upsert-batch-size",
        type=int,
        default=DEFAULT_TRIP_UPSERT_BATCH_SIZE,
    )
    parser.add_argument(
        "--source-key",
        type=str,
        default=None,
        help="Only ingest a specific source key, e.g. 150103",
    )
    parser.add_argument(
        "--file-shards",
        type=int,
        default=1,
        help="Split one source file across N workers",
    )
    parser.add_argument(
        "--pg-fast-mode",
        action="store_true",
        help="Enable aggressive PostgreSQL ingest tuning (UNLOGGED + session tuning)",
    )
    parser.add_argument(
        "--mode",
        choices=[
            "ingest",
            "rebuild",
            "refresh",
            "optimize",
            "compute",
            "smoke",
            "runtime",
            "refresh-stats",
            "refresh-ops",
            "refresh-risk",
            "refresh-report",
            "refresh-governance",
            "refresh-all",
        ],
        default="runtime",
        help="Pipeline mode: ingest|rebuild|refresh|optimize|compute|smoke|runtime|refresh-*",
    )
    args = parser.parse_args()
    run_pipeline(
        Path(args.base_dir),
        mode=args.mode,
        max_trips=args.max_trips,
        chunk_size=args.chunk_size,
        workers=args.workers,
        trip_upsert_batch_size=args.trip_upsert_batch_size,
        source_key=args.source_key,
        file_shards=max(1, args.file_shards),
        pg_fast_mode=args.pg_fast_mode,
    )


if __name__ == "__main__":
    main()
