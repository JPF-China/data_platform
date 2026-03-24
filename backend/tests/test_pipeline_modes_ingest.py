import os
from collections.abc import Iterator
from pathlib import Path
from typing import LiteralString, cast
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql

from app.etl.load_data import _truncate_rebuild_tables
from app.services import ingest_service


def _build_test_db_name() -> str:
    return f"harbin_pipeline_modes_{uuid4().hex[:10]}"


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
def pipeline_modes_conninfo() -> Iterator[str]:
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


def _seed_details_stats_and_route_tables(conninfo: str) -> None:
    with psycopg.connect(conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO trips (
                  trip_uid, source_trip_key, devid, trip_date,
                  start_time, end_time, point_count, valid_point_count, is_valid, source_file
                ) VALUES (
                  'modes:t1', '1', 'v1', '2015-01-03',
                  '2015-01-03 08:00:00', '2015-01-03 08:10:00', 2, 2, true, 'seed'
                )
                RETURNING id
                """
            )
            trip_id = int(cur.fetchone()[0])

            cur.execute(
                """
                INSERT INTO trip_segments (
                  trip_id, segment_seq, from_point_seq, to_point_seq,
                  start_time, end_time, distance_m, duration_s, avg_speed_kmh,
                  road_id, road_name, start_lat, start_lon, end_lat, end_lon, path_geom
                ) VALUES (
                  %s, 0, 0, 1,
                  '2015-01-03 08:00:00', '2015-01-03 08:10:00', 1000.0, 300.0, 12.0,
                  'seed_road', 'Seed Road', 45.7, 126.6, 45.71, 126.61,
                  ST_GeomFromText('LINESTRING(126.6000 45.7000,126.6100 45.7100)', 4326)
                )
                """,
                (trip_id,),
            )

            cur.execute(
                """
                INSERT INTO daily_metrics (
                  metric_date, trip_count, vehicle_count, distance_m, distance_km,
                  avg_trip_distance_m, median_trip_distance_m, avg_speed_kmh
                ) VALUES (
                  DATE '2015-01-03', 1, 1, 1000.0, 1.0, 1000.0, 1000.0, 12.0
                )
                """
            )
            cur.execute(
                """
                INSERT INTO road_speed_bins (
                  road_id, bucket_start, bucket_end, median_speed_kmh, mean_speed_kmh, sample_count
                ) VALUES (
                  'seed_road',
                  '2015-01-03 08:00:00'::timestamp,
                  '2015-01-03 08:05:00'::timestamp,
                  20.0, 20.0, 1
                )
                """
            )
            cur.execute(
                """
                INSERT INTO road_segments (
                  id, road_id, road_name, oneway, geom, length_m, source_node, target_node, travel_time_s, source
                ) VALUES (
                  9001, 'seed_rs', 'Seed Route', false,
                  ST_GeomFromText('LINESTRING(126.0000 45.0000,126.0100 45.0000)', 4326),
                  1000.0, 1, 2, 120.0, 'seed'
                )
                ON CONFLICT (road_id) DO NOTHING
                """
            )
            cur.execute(
                """
                INSERT INTO route_results (
                  query_time, start_point, end_point, route_type,
                  distance_m, estimated_time_s, path_geom, path_json, meta
                ) VALUES (
                  '2015-01-03 08:00:00'::timestamp,
                  ST_SetSRID(ST_MakePoint(126.0, 45.0), 4326),
                  ST_SetSRID(ST_MakePoint(126.01, 45.0), 4326),
                  'shortest',
                  1000.0, 120.0,
                  ST_Multi(ST_GeomFromText('LINESTRING(126.0000 45.0000,126.0100 45.0000)', 4326)),
                  '{}'::jsonb,
                  '{"source":"seed"}'::jsonb
                )
                """
            )
        conn.commit()


def test_ingest_truncate_only_clears_detail_tables(
    pipeline_modes_conninfo: str,
) -> None:
    _seed_details_stats_and_route_tables(pipeline_modes_conninfo)

    with psycopg.connect(pipeline_modes_conninfo) as conn:
        with conn.cursor() as cur:
            ingest_service.truncate_ingest_detail_tables(cur)
            conn.commit()

    with psycopg.connect(pipeline_modes_conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM trips")
            assert cur.fetchone()[0] == 0
            cur.execute("SELECT COUNT(*) FROM trip_segments")
            assert cur.fetchone()[0] == 0

            cur.execute("SELECT COUNT(*) FROM daily_metrics")
            assert cur.fetchone()[0] == 1
            cur.execute("SELECT COUNT(*) FROM road_speed_bins")
            assert cur.fetchone()[0] == 1
            cur.execute("SELECT COUNT(*) FROM route_results")
            assert cur.fetchone()[0] == 1


def test_rebuild_truncate_clears_stats_and_route_results(
    pipeline_modes_conninfo: str,
) -> None:
    with psycopg.connect(pipeline_modes_conninfo) as conn:
        with conn.cursor() as cur:
            _truncate_rebuild_tables(cur)
            conn.commit()

    with psycopg.connect(pipeline_modes_conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM daily_metrics")
            assert cur.fetchone()[0] == 0
            cur.execute("SELECT COUNT(*) FROM route_results")
            assert cur.fetchone()[0] == 0

            cur.execute("SELECT COUNT(*) FROM road_speed_bins")
            assert cur.fetchone()[0] == 1
