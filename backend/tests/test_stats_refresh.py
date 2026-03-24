import os
from pathlib import Path
from collections.abc import Iterator
from typing import LiteralString, cast
from uuid import uuid4

import psycopg
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from psycopg import sql

from app.services.query_service import fetch_daily_summary
from app.services.stats_service import (
    aggregate_daily_distance_boxplot,
    aggregate_daily_metrics,
    aggregate_daily_speed_boxplot,
    aggregate_heatmap_bins,
    aggregate_table_row_stats,
)


def _build_test_db_name() -> str:
    return f"harbin_stats_test_{uuid4().hex[:10]}"


def _admin_conninfo() -> str:
    return os.environ.get(
        "DB_ADMIN_CONNINFO", "dbname=postgres user=apple host=localhost port=5432"
    )


def _test_conninfo(db_name: str) -> str:
    return f"dbname={db_name} user=apple host=localhost port=5432"


def _test_database_url(db_name: str) -> str:
    return f"postgresql+psycopg://apple@localhost:5432/{db_name}"


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


def _seed_stats_source_data(conninfo: str) -> None:
    with psycopg.connect(conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO trips (
                  trip_uid, source_trip_key, devid, trip_date,
                  start_time, end_time, point_count, valid_point_count, is_valid, source_file
                ) VALUES
                  ('stats:t1', '1', 'v1', '2015-01-03', '2015-01-03 08:00:00', '2015-01-03 08:20:00', 3, 3, true, 'seed'),
                  ('stats:t2', '2', 'v2', '2015-01-03', '2015-01-03 09:00:00', '2015-01-03 09:05:00', 2, 2, true, 'seed'),
                  ('stats:t3_invalid', '3', 'v3', '2015-01-03', '2015-01-03 10:00:00', '2015-01-03 10:10:00', 2, 1, false, 'seed')
                """
            )

            cur.execute(
                """
                WITH ids AS (
                  SELECT id, trip_uid FROM trips WHERE trip_uid LIKE 'stats:%'
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
                    ('stats:t1', 0, 0, 1, '2015-01-03 08:00:00'::timestamp, '2015-01-03 08:10:00'::timestamp, 3000.0, 360.0, 30.0, 'road_a', 'Road A', 45.7000, 126.6000, 45.7100, 126.6100, 'LINESTRING(126.6000 45.7000,126.6100 45.7100)'),
                    ('stats:t1', 1, 1, 2, '2015-01-03 08:10:00'::timestamp, '2015-01-03 08:20:00'::timestamp, 2000.0, 144.0, 50.0, 'road_b', 'Road B', 45.7100, 126.6100, 45.7200, 126.6200, 'LINESTRING(126.6100 45.7100,126.6200 45.7200)'),
                    ('stats:t2', 0, 0, 1, '2015-01-03 09:00:00'::timestamp, '2015-01-03 09:05:00'::timestamp, 1000.0, 180.0, 20.0, 'road_c', 'Road C', 45.7200, 126.6200, 45.7250, 126.6300, 'LINESTRING(126.6200 45.7200,126.6300 45.7250)'),
                    ('stats:t3_invalid', 0, 0, 1, '2015-01-03 10:00:00'::timestamp, '2015-01-03 10:10:00'::timestamp, 9000.0, 600.0, 54.0, 'road_z', 'Road Z', 45.7300, 126.6400, 45.7400, 126.6500, 'LINESTRING(126.6400 45.7300,126.6500 45.7400)')
                ) AS s(
                  trip_uid, segment_seq, from_point_seq, to_point_seq, start_time, end_time,
                  distance_m, duration_s, avg_speed_kmh, road_id, road_name,
                  start_lat, start_lon, end_lat, end_lon, path_wkt
                )
                  ON s.trip_uid = i.trip_uid
                """
            )
        conn.commit()


@pytest.fixture(scope="module")
def stats_test_db() -> Iterator[dict[str, str]]:
    db_name = _build_test_db_name()
    conninfo = _test_conninfo(db_name)
    db_url = _test_database_url(db_name)

    with psycopg.connect(_admin_conninfo(), autocommit=True) as admin_conn:
        with admin_conn.cursor() as cur:
            cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db_name)))

    try:
        _apply_schema(conninfo)
        _seed_stats_source_data(conninfo)
        yield {"conninfo": conninfo, "database_url": db_url, "db_name": db_name}
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


def _run_stats_refresh(conninfo: str) -> None:
    with psycopg.connect(conninfo) as conn:
        with conn.cursor() as cur:
            aggregate_daily_metrics(cur)
            aggregate_daily_distance_boxplot(cur)
            aggregate_daily_speed_boxplot(cur)
            aggregate_heatmap_bins(cur)
            aggregate_table_row_stats(cur)
        conn.commit()


def test_stats_refresh_outputs_and_caliber(stats_test_db: dict[str, str]) -> None:
    _run_stats_refresh(stats_test_db["conninfo"])

    with psycopg.connect(stats_test_db["conninfo"]) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT trip_count, vehicle_count, distance_m, avg_trip_distance_m, median_trip_distance_m
                FROM daily_metrics
                WHERE metric_date = DATE '2015-01-03'
                """
            )
            row = cur.fetchone()
            assert row is not None
            (
                trip_count,
                vehicle_count,
                distance_m,
                avg_trip_distance_m,
                median_trip_distance_m,
            ) = row
            assert trip_count == 2
            assert vehicle_count == 2
            assert distance_m == pytest.approx(6000.0)
            assert avg_trip_distance_m == pytest.approx(3000.0)
            assert median_trip_distance_m == pytest.approx(3000.0)

            cur.execute(
                """
                SELECT min_value, q1_value, median_value, q3_value, max_value, sample_count
                FROM daily_distance_boxplot
                WHERE metric_date = DATE '2015-01-03'
                """
            )
            row = cur.fetchone()
            assert row is not None
            min_value, q1_value, median_value, q3_value, max_value, sample_count = row
            assert min_value == pytest.approx(1000.0)
            assert q1_value == pytest.approx(2000.0)
            assert median_value == pytest.approx(3000.0)
            assert q3_value == pytest.approx(4000.0)
            assert max_value == pytest.approx(5000.0)
            assert sample_count == 2

            cur.execute(
                """
                SELECT min_value, q1_value, median_value, q3_value, max_value, sample_count
                FROM daily_speed_boxplot
                WHERE metric_date = DATE '2015-01-03'
                """
            )
            row = cur.fetchone()
            assert row is not None
            min_value, q1_value, median_value, q3_value, max_value, sample_count = row
            assert min_value == pytest.approx(20.0)
            assert q1_value == pytest.approx(25.0)
            assert median_value == pytest.approx(30.0)
            assert q3_value == pytest.approx(40.0)
            assert max_value == pytest.approx(50.0)
            assert sample_count == 3

            cur.execute(
                """
                SELECT COUNT(*)
                FROM heatmap_bins
                WHERE metric_date = DATE '2015-01-03'
                """
            )
            count_row = cur.fetchone()
            assert count_row is not None
            assert count_row[0] > 0


def test_query_reads_precomputed_stats_only(stats_test_db: dict[str, str]) -> None:
    _run_stats_refresh(stats_test_db["conninfo"])

    engine = create_engine(stats_test_db["database_url"], future=True)
    try:
        with Session(engine) as db:
            baseline = fetch_daily_summary(db)
            assert len(baseline) == 1
            assert baseline[0]["trip_count"] == 2
            assert baseline[0]["distance_km"] == pytest.approx(6.0)

            db.execute(text("TRUNCATE trip_segments, trips RESTART IDENTITY CASCADE"))
            db.commit()

            after_detail_truncate = fetch_daily_summary(db)
            assert after_detail_truncate == baseline
    finally:
        engine.dispose()
