import os
from collections.abc import Iterator
from pathlib import Path
from typing import LiteralString, cast
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql

from app.etl.load_data import _step3_compute


def _build_test_db_name() -> str:
    return f"harbin_stats_orch_{uuid4().hex[:10]}"


def _admin_conninfo() -> str:
    return os.environ.get(
        "DB_ADMIN_CONNINFO", "dbname=postgres user=apple host=localhost port=5432"
    )


def _test_conninfo(db_name: str) -> str:
    return f"dbname={db_name} user=apple host=localhost port=5432"


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
def stats_orch_conninfo() -> Iterator[str]:
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


def _seed_stats_source_data(conninfo: str) -> None:
    with psycopg.connect(conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO trips (
                  trip_uid, source_trip_key, devid, trip_date,
                  start_time, end_time, point_count, valid_point_count, is_valid, source_file
                ) VALUES
                  ('orch:t1', '1', 'v1', '2015-01-03', '2015-01-03 08:00:00', '2015-01-03 08:20:00', 3, 3, true, 'seed'),
                  ('orch:t2', '2', 'v2', '2015-01-03', '2015-01-03 09:00:00', '2015-01-03 09:05:00', 2, 2, true, 'seed')
                """
            )
            cur.execute(
                """
                WITH ids AS (
                  SELECT id, trip_uid FROM trips WHERE trip_uid LIKE 'orch:%'
                )
                INSERT INTO trip_segments (
                  trip_id, segment_seq, from_point_seq, to_point_seq, start_time, end_time,
                  distance_m, duration_s, avg_speed_kmh, road_id, road_name,
                  start_lat, start_lon, end_lat, end_lon, path_geom
                )
                SELECT
                  i.id,
                  s.segment_seq,
                  s.from_point_seq,
                  s.to_point_seq,
                  s.start_time,
                  s.end_time,
                  s.distance_m,
                  s.duration_s,
                  s.avg_speed_kmh,
                  s.road_id,
                  s.road_name,
                  s.start_lat,
                  s.start_lon,
                  s.end_lat,
                  s.end_lon,
                  ST_GeomFromText(s.path_wkt, 4326)
                FROM ids i
                JOIN (
                  VALUES
                    ('orch:t1', 0, 0, 1, '2015-01-03 08:00:00'::timestamp, '2015-01-03 08:10:00'::timestamp, 3000.0, 360.0, 30.0, 'road_a', 'Road A', 45.7000, 126.6000, 45.7100, 126.6100, 'LINESTRING(126.6000 45.7000,126.6100 45.7100)'),
                    ('orch:t1', 1, 1, 2, '2015-01-03 08:10:00'::timestamp, '2015-01-03 08:20:00'::timestamp, 2000.0, 144.0, 50.0, 'road_b', 'Road B', 45.7100, 126.6100, 45.7200, 126.6200, 'LINESTRING(126.6100 45.7100,126.6200 45.7200)'),
                    ('orch:t2', 0, 0, 1, '2015-01-03 09:00:00'::timestamp, '2015-01-03 09:05:00'::timestamp, 1000.0, 180.0, 20.0, 'road_c', 'Road C', 45.7200, 126.6200, 45.7250, 126.6300, 'LINESTRING(126.6200 45.7200,126.6300 45.7250)')
                ) AS s(
                  trip_uid, segment_seq, from_point_seq, to_point_seq, start_time, end_time,
                  distance_m, duration_s, avg_speed_kmh, road_id, road_name,
                  start_lat, start_lon, end_lat, end_lon, path_wkt
                )
                  ON s.trip_uid = i.trip_uid
                """
            )
        conn.commit()


def _seed_stale_stats_rows(conninfo: str) -> None:
    with psycopg.connect(conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO daily_metrics (
                  metric_date, trip_count, vehicle_count, distance_m, distance_km,
                  avg_trip_distance_m, median_trip_distance_m, avg_speed_kmh
                ) VALUES
                  (DATE '1999-01-01', 99, 99, 99, 0.099, 99, 99, 99)
                ON CONFLICT (metric_date) DO UPDATE SET trip_count = EXCLUDED.trip_count
                """
            )
            cur.execute(
                """
                INSERT INTO road_speed_bins (
                  road_id, bucket_start, bucket_end, median_speed_kmh, mean_speed_kmh, sample_count
                ) VALUES (
                  'stale_road',
                  '1999-01-01 00:00:00'::timestamp,
                  '1999-01-01 00:05:00'::timestamp,
                  1.0, 1.0, 1
                )
                ON CONFLICT (road_id, bucket_start) DO NOTHING
                """
            )
        conn.commit()


def test_step3_compute_replaces_stale_stats_and_builds_speed_bins(
    stats_orch_conninfo: str,
) -> None:
    _seed_stats_source_data(stats_orch_conninfo)
    _seed_stale_stats_rows(stats_orch_conninfo)

    with psycopg.connect(stats_orch_conninfo) as conn:
        with conn.cursor() as cur:
            _step3_compute(cur)
        conn.commit()

    with psycopg.connect(stats_orch_conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM daily_metrics WHERE metric_date = DATE '1999-01-01'"
            )
            assert cur.fetchone()[0] == 0

            cur.execute(
                "SELECT COUNT(*) FROM road_speed_bins WHERE road_id = 'stale_road'"
            )
            assert cur.fetchone()[0] == 0

            cur.execute("SELECT COUNT(*) FROM daily_metrics")
            assert cur.fetchone()[0] == 1

            cur.execute("SELECT COUNT(*) FROM road_speed_bins")
            speed_bins_count = cur.fetchone()[0]
            assert speed_bins_count > 0
