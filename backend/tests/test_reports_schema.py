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


def test_daily_report_table_exists() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'report_daily_summary')"
            )
            assert cur.fetchone()[0] is True


def test_daily_report_populates_rows() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT report_refresh_daily()")
            cur.execute("SELECT COUNT(*) FROM report_daily_summary")
            count = cur.fetchone()[0]
            assert count >= 1


def test_daily_report_columns_ok() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT report_refresh_daily()")
            cur.execute(
                """
                SELECT report_date, total_trips, total_vehicles,
                       total_distance_km, avg_trip_distance_m,
                       fatigue_count, severe_fatigue_count,
                       peak_vehicles, night_vehicles
                FROM report_daily_summary
                ORDER BY report_date DESC LIMIT 1
                """
            )
            row = cur.fetchone()
            assert row is not None


def test_weekly_report_table_exists() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'report_weekly_summary')"
            )
            assert cur.fetchone()[0] is True


def test_weekly_report_populates_rows() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT report_refresh_weekly()")
            cur.execute("SELECT COUNT(*) FROM report_weekly_summary")
            count = cur.fetchone()[0]
            assert count >= 1
