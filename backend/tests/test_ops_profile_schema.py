from __future__ import annotations

import os

import psycopg


def _conninfo() -> str:
    db_user = os.getenv("DB_USER", "postgres")
    db_password = os.getenv("DB_PASSWORD", "postgres")
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "5432")
    db_name = os.getenv("TEST_DB_NAME", "harbin_test")
    return (
        f"dbname={db_name} user={db_user} host={db_host} "
        f"port={db_port} password={db_password}"
    )


def _table_exists(cur: psycopg.Cursor, table_name: str) -> bool:
    cur.execute("SELECT to_regclass(%s)", (f"public.{table_name}",))
    row = cur.fetchone()
    return bool(row and row[0])


def test_ops_profile_tables_exist() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            for table_name in (
                "ops_vehicle_profile",
                "ops_vehicle_tag",
                "ops_vehicle_tag_summary",
            ):
                assert _table_exists(cur, table_name)


def test_ops_profile_tables_basic_write() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ops_vehicle_profile (
                  vehicle_id, active_days, trip_count, total_distance_m,
                  avg_trip_distance_m, avg_speed_kmh, dominant_start_hour
                ) VALUES (
                  'seed_vehicle_1', 3, 5, 12000, 2400, 32.5, 8
                )
                ON CONFLICT (vehicle_id) DO UPDATE SET
                  trip_count = EXCLUDED.trip_count,
                  total_distance_m = EXCLUDED.total_distance_m
                """
            )
            cur.execute(
                """
                INSERT INTO ops_vehicle_tag (
                  vehicle_id, tag_code, tag_name, tag_type, tag_score, evidence
                ) VALUES (
                  'seed_vehicle_1', 'commuter', 'High Peak', 'stat', 0.8, '{}'
                )
                ON CONFLICT (vehicle_id, tag_code) DO UPDATE SET
                  tag_score = EXCLUDED.tag_score
                """
            )
            cur.execute(
                """
                INSERT INTO ops_vehicle_tag_summary (
                  tag_code, tag_name, vehicle_count, avg_trip_count
                ) VALUES (
                  'commuter', 'High Peak', 1, 5.0
                )
                ON CONFLICT (tag_code) DO UPDATE SET
                  vehicle_count = EXCLUDED.vehicle_count
                """
            )
        conn.commit()
