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


def test_hourly_metrics_table_exists() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'hourly_metrics')"
            )
            assert cur.fetchone()[0] is True


def test_hourly_metrics_populates_rows() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT stats_refresh_hourly_metrics()")
            cur.execute("SELECT COUNT(*) FROM hourly_metrics")
            count = cur.fetchone()[0]
            assert count >= 1


def test_hourly_metrics_columns_ok() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT stats_refresh_hourly_metrics()")
            cur.execute(
                """
                SELECT metric_date, hour_bucket, trip_count, vehicle_count, distance_m,
                       avg_speed_kmh, peak_flag
                FROM hourly_metrics
                ORDER BY metric_date, hour_bucket
                LIMIT 1
                """
            )
            row = cur.fetchone()
            assert row is not None


def test_road_daily_stats_table_exists() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'road_daily_stats')"
            )
            assert cur.fetchone()[0] is True


def test_road_daily_stats_populates_rows() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT stats_refresh_road_daily_stats()")
            cur.execute("SELECT COUNT(*) FROM road_daily_stats")
            count = cur.fetchone()[0]
            assert count >= 1
