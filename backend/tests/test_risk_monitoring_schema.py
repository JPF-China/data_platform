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


def test_risk_tables_exist() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            for table_name in (
                "risk_driver_fatigue",
                "risk_driver_fatigue_event",
            ):
                assert _table_exists(cur, table_name)


def test_risk_tables_basic_write() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO risk_driver_fatigue (
                  driver_id, window_start, window_end,
                  run_minutes, fatigue_level, threshold_minutes
                ) VALUES (
                  'seed_vehicle_1', '2015-01-03 00:00:00', '2015-01-04 00:00:00',
                  720, 'fatigue', 720
                )
                ON CONFLICT (driver_id, window_start) DO UPDATE SET
                  run_minutes = EXCLUDED.run_minutes,
                  fatigue_level = EXCLUDED.fatigue_level
                """
            )
            cur.execute(
                """
                INSERT INTO risk_driver_fatigue_event (
                  driver_id, event_time, fatigue_level, run_minutes, threshold_minutes, source_window_start
                ) VALUES (
                  'seed_vehicle_1', '2015-01-03 12:00:00', 'fatigue', 720, 720,
                  '2015-01-03 00:00:00'
                )
                """
            )
        conn.commit()
