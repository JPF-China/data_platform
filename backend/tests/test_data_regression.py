import os
from collections.abc import Iterator
from pathlib import Path
from typing import LiteralString, cast
from uuid import uuid4

import psycopg
import pytest
from sqlalchemy import create_engine
from sqlalchemy import text
from psycopg.rows import dict_row
from psycopg import sql

from app.services.stats_service import (
    aggregate_daily_distance_boxplot,
    aggregate_daily_metrics,
    aggregate_daily_speed_boxplot,
    aggregate_heatmap_bins,
    aggregate_table_row_stats,
)


def _build_test_db_name() -> str:
    return f"harbin_data_reg_{uuid4().hex[:10]}"


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


def _seed(conninfo: str) -> None:
    with psycopg.connect(conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO trips (
                  trip_uid, source_trip_key, devid, trip_date,
                  start_time, end_time, point_count, valid_point_count, is_valid, source_file
                ) VALUES
                  ('reg:t1', '1', 'v1', '2015-01-03', '2015-01-03 08:00:00', '2015-01-03 08:10:00', 3, 3, true, 'seed'),
                  ('reg:t2', '2', 'v2', '2015-01-03', '2015-01-03 09:00:00', '2015-01-03 09:08:00', 2, 2, true, 'seed')
                """
            )
            cur.execute(
                """
                WITH ids AS (
                  SELECT id, trip_uid FROM trips WHERE trip_uid LIKE 'reg:%'
                )
                INSERT INTO trip_points_raw (
                  trip_id, point_seq, event_time, tms, devid, lat, lon, speed, geom, is_valid
                )
                SELECT
                  i.id, p.point_seq, p.event_time, p.tms, p.devid, p.lat, p.lon, p.speed,
                  ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326), true
                FROM ids i
                JOIN (
                  VALUES
                    ('reg:t1', 0, '2015-01-03 08:00:00'::timestamp, 1420243200::bigint, 'v1', 45.756, 126.642, 30.0),
                    ('reg:t1', 1, '2015-01-03 08:05:00'::timestamp, 1420243500::bigint, 'v1', 45.740, 126.620, 36.0),
                    ('reg:t1', 2, '2015-01-03 08:10:00'::timestamp, 1420243800::bigint, 'v1', 45.721, 126.588, 42.0),
                    ('reg:t2', 0, '2015-01-03 09:00:00'::timestamp, 1420246800::bigint, 'v2', 45.720, 126.620, 20.0),
                    ('reg:t2', 1, '2015-01-03 09:08:00'::timestamp, 1420247280::bigint, 'v2', 45.730, 126.640, 28.0)
                ) AS p(trip_uid, point_seq, event_time, tms, devid, lat, lon, speed)
                  ON p.trip_uid = i.trip_uid
                """
            )
            cur.execute(
                """
                WITH ids AS (
                  SELECT id, trip_uid FROM trips WHERE trip_uid LIKE 'reg:%'
                )
                INSERT INTO trip_points_matched (
                  trip_id, point_seq, event_time, tms, lat, lon, geom, road_id, road_name, matched_offset_m, confidence, is_virtual
                )
                SELECT
                  i.id, p.point_seq, p.event_time, p.tms, p.lat, p.lon,
                  ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326), p.road_id, p.road_name, 0.0, 0.9, false
                FROM ids i
                JOIN (
                  VALUES
                    ('reg:t1', 0, '2015-01-03 08:00:00'::timestamp, 1420243200::bigint, 45.756, 126.642, 'reg_r1', 'Reg Road 1'),
                    ('reg:t1', 1, '2015-01-03 08:05:00'::timestamp, 1420243500::bigint, 45.740, 126.620, 'reg_r2', 'Reg Road 2'),
                    ('reg:t1', 2, '2015-01-03 08:10:00'::timestamp, 1420243800::bigint, 45.721, 126.588, 'reg_r3', 'Reg Road 3'),
                    ('reg:t2', 0, '2015-01-03 09:00:00'::timestamp, 1420246800::bigint, 45.720, 126.620, 'reg_r4', 'Reg Road 4'),
                    ('reg:t2', 1, '2015-01-03 09:08:00'::timestamp, 1420247280::bigint, 45.730, 126.640, 'reg_r5', 'Reg Road 5')
                ) AS p(trip_uid, point_seq, event_time, tms, lat, lon, road_id, road_name)
                  ON p.trip_uid = i.trip_uid
                """
            )
            cur.execute(
                """
                WITH ids AS (
                  SELECT id, trip_uid FROM trips WHERE trip_uid LIKE 'reg:%'
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
                    ('reg:t1', 0, 0, 1, '2015-01-03 08:00:00'::timestamp, '2015-01-03 08:05:00'::timestamp, 3000.0, 300.0, 36.0, 'reg_r1', 'Reg Road 1', 45.756, 126.642, 45.740, 126.620, 'LINESTRING(126.642 45.756,126.620 45.740)'),
                    ('reg:t1', 1, 1, 2, '2015-01-03 08:05:00'::timestamp, '2015-01-03 08:10:00'::timestamp, 4000.0, 300.0, 48.0, 'reg_r2', 'Reg Road 2', 45.740, 126.620, 45.721, 126.588, 'LINESTRING(126.620 45.740,126.588 45.721)'),
                    ('reg:t2', 0, 0, 1, '2015-01-03 09:00:00'::timestamp, '2015-01-03 09:08:00'::timestamp, 2000.0, 480.0, 15.0, 'reg_r4', 'Reg Road 4', 45.720, 126.620, 45.730, 126.640, 'LINESTRING(126.620 45.720,126.640 45.730)')
                ) AS s(
                  trip_uid, segment_seq, from_point_seq, to_point_seq, start_time, end_time,
                  distance_m, duration_s, avg_speed_kmh, road_id, road_name,
                  start_lat, start_lon, end_lat, end_lon, path_wkt
                )
                  ON s.trip_uid = i.trip_uid
                """
            )

            aggregate_daily_metrics(cur)
            aggregate_daily_distance_boxplot(cur)
            aggregate_daily_speed_boxplot(cur)
            aggregate_heatmap_bins(cur)
            aggregate_table_row_stats(cur)
        conn.commit()


@pytest.fixture(scope="module")
def regression_test_conninfo() -> Iterator[str]:
    db_name = _build_test_db_name()
    conninfo = _test_conninfo(db_name)
    with psycopg.connect(_admin_conninfo(), autocommit=True) as admin_conn:
        with admin_conn.cursor() as cur:
            cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db_name)))
    try:
        _apply_schema(conninfo)
        _seed(conninfo)
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


def test_core_table_counts_nonzero(regression_test_conninfo: str):
    with psycopg.connect(regression_test_conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  (SELECT COUNT(*) FROM trips) AS trips,
                  (SELECT COUNT(*) FROM trip_points_raw) AS raw_points,
                  (SELECT COUNT(*) FROM trip_points_matched) AS matched_points,
                  (SELECT COUNT(*) FROM trip_segments) AS segments,
                  (SELECT COUNT(*) FROM daily_metrics) AS daily_metrics,
                  (SELECT COUNT(*) FROM daily_distance_boxplot) AS daily_distance_boxplot,
                  (SELECT COUNT(*) FROM daily_speed_boxplot) AS daily_speed_boxplot,
                  (SELECT COUNT(*) FROM table_row_stats) AS table_row_stats,
                  (SELECT COUNT(*) FROM heatmap_bins) AS heatmap_bins
                """
            )
            row = cur.fetchone()
            assert row is not None
            (
                trips,
                raw_points,
                matched_points,
                segments,
                daily_metrics,
                daily_distance_boxplot,
                daily_speed_boxplot,
                table_row_stats,
                heatmap_bins,
            ) = row

            assert trips > 0
            assert raw_points > 0
            assert matched_points > 0
            assert segments > 0
            assert daily_metrics > 0
            assert daily_distance_boxplot > 0
            assert daily_speed_boxplot > 0
            assert table_row_stats > 0
            assert heatmap_bins > 0


def test_boxplot_columns_present(regression_test_conninfo: str):
    with psycopg.connect(regression_test_conninfo) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT trip_date, q1, median, q3, min_value, max_value, sample_count
                FROM (
                  SELECT
                    metric_date AS trip_date,
                    q1_value AS q1,
                    median_value AS median,
                    q3_value AS q3,
                    min_value,
                    max_value,
                    sample_count
                  FROM daily_speed_boxplot
                ) z
                ORDER BY trip_date
                LIMIT 1
                """
            )
            row = cur.fetchone()
            assert row is not None
            for key in [
                "trip_date",
                "q1",
                "median",
                "q3",
                "min_value",
                "max_value",
                "sample_count",
            ]:
                assert key in row


def test_distance_boxplot_columns_present(regression_test_conninfo: str):
    with psycopg.connect(regression_test_conninfo) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT trip_date, q1, median, q3, min_value, max_value, sample_count
                FROM (
                  SELECT
                    metric_date AS trip_date,
                    q1_value AS q1,
                    median_value AS median,
                    q3_value AS q3,
                    min_value,
                    max_value,
                    sample_count
                  FROM daily_distance_boxplot
                ) z
                ORDER BY trip_date
                LIMIT 1
                """
            )
            row = cur.fetchone()
            assert row is not None
            for key in [
                "trip_date",
                "q1",
                "median",
                "q3",
                "min_value",
                "max_value",
                "sample_count",
            ]:
                assert key in row


def test_daily_summary_contract_with_isolated_database(regression_test_conninfo: str):
    engine = create_engine(
        f"postgresql+psycopg://apple@localhost:5432/{regression_test_conninfo.split()[0].split('=')[1]}",
        future=True,
    )
    try:
        with engine.begin() as conn:
            row = (
                conn.execute(
                    text(
                        """
                    SELECT metric_date, trip_count, vehicle_count, distance_km
                    FROM daily_metrics
                    ORDER BY metric_date
                    LIMIT 1
                    """
                    )
                )
                .mappings()
                .first()
            )
            assert row is not None
            assert row["trip_count"] == 2
            assert row["vehicle_count"] == 2
            assert row["distance_km"] == pytest.approx(9.0)
    finally:
        engine.dispose()
