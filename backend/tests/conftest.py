import os
from pathlib import Path
from typing import LiteralString, cast

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql
from sqlalchemy import text

TEST_DB_NAME = os.getenv("TEST_DB_NAME", "harbin_test")

# Database configuration for tests
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

# Set environment variables for the application
os.environ["DATABASE_URL"] = (
    f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{TEST_DB_NAME}"
)
os.environ["DB_CONNINFO"] = (
    f"dbname={TEST_DB_NAME} user={DB_USER} host={DB_HOST} port={DB_PORT} password={DB_PASSWORD}"
)

from app.db.session import SessionLocal
from app.main import app


def _ensure_test_database() -> None:
    with psycopg.connect(
        f"dbname=postgres user={DB_USER} password={DB_PASSWORD} host={DB_HOST} port={DB_PORT}",
        autocommit=True,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB_NAME,))
            if cur.fetchone() is None:
                cur.execute(
                    sql.SQL("CREATE DATABASE {}").format(sql.Identifier(TEST_DB_NAME))
                )


def _apply_schema() -> None:
    sql_dir = Path(__file__).resolve().parents[2] / "infra" / "postgres"
    with psycopg.connect(os.environ["DB_CONNINFO"]) as conn:
        with conn.cursor() as cur:
            for name in ("init.sql", "ingest_schema.sql", "stats_schema.sql"):
                schema_sql = cast(
                    LiteralString, (sql_dir / name).read_text(encoding="utf-8")
                )
                cur.execute(schema_sql)
        conn.commit()


def _seed_minimal_data() -> None:
    db = SessionLocal()
    try:
        has_trips = db.execute(text("SELECT COUNT(*) FROM trips")).scalar_one()
        if has_trips > 0:
            return

        db.execute(
            text(
                """
                INSERT INTO trips (
                  trip_uid, source_trip_key, devid, trip_date, start_time, end_time,
                  point_count, valid_point_count, is_valid, source_file
                ) VALUES (
                  'seed:trip:1', '1', 'seed_vehicle_1', '2015-01-03',
                  '2015-01-03 08:00:00', '2015-01-03 08:10:00',
                  3, 3, true, 'seed'
                )
                ON CONFLICT (trip_uid) DO NOTHING
                """
            )
        )
        trip_id = db.execute(
            text("SELECT id FROM trips WHERE trip_uid = 'seed:trip:1'")
        ).scalar_one()

        db.execute(
            text("DELETE FROM trip_points_raw WHERE trip_id = :tid"), {"tid": trip_id}
        )
        db.execute(
            text("DELETE FROM trip_points_matched WHERE trip_id = :tid"),
            {"tid": trip_id},
        )
        db.execute(
            text("DELETE FROM trip_segments WHERE trip_id = :tid"), {"tid": trip_id}
        )
        db.execute(text("DELETE FROM route_results"))
        db.execute(text("DELETE FROM road_segments"))

        db.execute(
            text(
                """
                INSERT INTO trip_points_raw (
                  trip_id, point_seq, event_time, tms, devid, lat, lon, speed, geom, is_valid
                ) VALUES
                  (:tid, 0, '2015-01-03 08:00:00', 1420243200, 'seed_vehicle_1', 45.756000, 126.642000, 30,
                   ST_SetSRID(ST_MakePoint(126.642000, 45.756000), 4326), true),
                  (:tid, 1, '2015-01-03 08:05:00', 1420243500, 'seed_vehicle_1', 45.740000, 126.620000, 36,
                   ST_SetSRID(ST_MakePoint(126.620000, 45.740000), 4326), true),
                  (:tid, 2, '2015-01-03 08:10:00', 1420243800, 'seed_vehicle_1', 45.721000, 126.588000, 42,
                   ST_SetSRID(ST_MakePoint(126.588000, 45.721000), 4326), true)
                """
            ),
            {"tid": trip_id},
        )

        db.execute(
            text(
                """
                INSERT INTO trip_points_matched (
                  trip_id, point_seq, event_time, tms, lat, lon, geom, road_id, is_virtual
                ) VALUES
                  (:tid, 0, '2015-01-03 08:00:00', 1420243200, 45.756000, 126.642000,
                   ST_SetSRID(ST_MakePoint(126.642000, 45.756000), 4326), 'seed_r1', false),
                  (:tid, 1, '2015-01-03 08:05:00', 1420243500, 45.740000, 126.620000,
                   ST_SetSRID(ST_MakePoint(126.620000, 45.740000), 4326), 'seed_r2', false),
                  (:tid, 2, '2015-01-03 08:10:00', 1420243800, 45.721000, 126.588000,
                   ST_SetSRID(ST_MakePoint(126.588000, 45.721000), 4326), 'seed_r3', false)
                """
            ),
            {"tid": trip_id},
        )

        db.execute(
            text(
                """
                INSERT INTO trip_segments (
                  trip_id, segment_seq, from_point_seq, to_point_seq, start_time, end_time,
                  distance_m, duration_s, avg_speed_kmh, road_id, road_name,
                  start_lat, start_lon, end_lat, end_lon, path_geom
                ) VALUES
                  (:tid, 0, 0, 1, '2015-01-03 08:00:00', '2015-01-03 08:05:00',
                   3000, 300, 36, 'seed_r1', 'Seed Road 1',
                   45.756000, 126.642000, 45.740000, 126.620000,
                   ST_GeomFromText('LINESTRING(126.642000 45.756000,126.620000 45.740000)', 4326)),
                  (:tid, 1, 1, 2, '2015-01-03 08:05:00', '2015-01-03 08:10:00',
                   4000, 300, 48, 'seed_r2', 'Seed Road 2',
                   45.740000, 126.620000, 45.721000, 126.588000,
                   ST_GeomFromText('LINESTRING(126.620000 45.740000,126.588000 45.721000)', 4326))
                """
            ),
            {"tid": trip_id},
        )

        db.execute(text("DELETE FROM daily_metrics"))
        db.execute(text("DELETE FROM daily_distance_boxplot"))
        db.execute(text("DELETE FROM daily_speed_boxplot"))
        db.execute(text("DELETE FROM table_row_stats"))
        db.execute(
            text(
                """
                INSERT INTO daily_metrics (
                  metric_date, trip_count, vehicle_count, distance_m, distance_km,
                  avg_trip_distance_m, median_trip_distance_m, avg_speed_kmh
                ) VALUES ('2015-01-03', 1, 1, 7000, 7.0, 7000, 7000, 42)
                """
            )
        )

        db.execute(
            text(
                """
                INSERT INTO road_segments (
                  id, road_id, road_name, oneway, geom, length_m,
                  source_node, target_node, travel_time_s, source
                ) VALUES
                  (201, 'seed_rs_1', 'Seed Segment 1', false,
                   ST_GeomFromText('LINESTRING(126.642000 45.756000,126.620000 45.740000)', 4326),
                   3000.0, 1001, 1002, 300.0, 'seed'),
                  (202, 'seed_rs_2', 'Seed Segment 2', false,
                   ST_GeomFromText('LINESTRING(126.620000 45.740000,126.588000 45.721000)', 4326),
                   4000.0, 1002, 1003, 300.0, 'seed')
                ON CONFLICT (road_id) DO UPDATE
                SET
                  road_name = EXCLUDED.road_name,
                  oneway = EXCLUDED.oneway,
                  geom = EXCLUDED.geom,
                  length_m = EXCLUDED.length_m,
                  source_node = EXCLUDED.source_node,
                  target_node = EXCLUDED.target_node,
                  travel_time_s = EXCLUDED.travel_time_s,
                  source = EXCLUDED.source
                """
            )
        )
        db.execute(
            text(
                """
                INSERT INTO daily_distance_boxplot (
                  metric_date, min_value, q1_value, median_value, q3_value, max_value, sample_count
                ) VALUES ('2015-01-03', 7000, 7000, 7000, 7000, 7000, 1)
                """
            )
        )
        db.execute(
            text(
                """
                INSERT INTO daily_speed_boxplot (
                  metric_date, min_value, q1_value, median_value, q3_value, max_value, sample_count
                ) VALUES ('2015-01-03', 42, 42, 42, 42, 42, 1)
                """
            )
        )

        db.execute(text("DELETE FROM heatmap_bins"))
        db.execute(
            text(
                """
                INSERT INTO heatmap_bins (
                  metric_date, time_bucket_start, time_bucket_end, road_id, road_name,
                  trip_count, vehicle_count, flow_count, distance_m, geom
                ) VALUES (
                  '2015-01-03', '2015-01-03 08:00:00', '2015-01-03 08:05:00',
                  'seed_r1', 'Seed Road 1', 1, 1, 2, 3000,
                  ST_Multi(ST_GeomFromText('LINESTRING(126.642000 45.756000,126.620000 45.740000)', 4326))
                )
                """
            )
        )
        db.execute(
            text(
                """
                INSERT INTO table_row_stats (table_name, row_count, refreshed_at)
                VALUES
                  ('daily_metrics', 1, now()),
                  ('daily_distance_boxplot', 1, now()),
                  ('daily_speed_boxplot', 1, now()),
                  ('heatmap_bins', 1, now()),
                  ('road_speed_bins', 0, now())
                ON CONFLICT (table_name) DO UPDATE
                SET row_count = EXCLUDED.row_count,
                    refreshed_at = EXCLUDED.refreshed_at
                """
            )
        )

        db.commit()
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def prepare_test_db() -> None:
    _ensure_test_database()
    _apply_schema()
    _seed_minimal_data()


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)
