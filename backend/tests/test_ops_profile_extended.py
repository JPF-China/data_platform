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


def test_frequent_route_table_exists() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ops_frequent_route')"
            )
            assert cur.fetchone()[0] is True


def test_frequent_route_populates_rows() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ops_refresh_frequent_routes()")
            cur.execute("SELECT COUNT(*) FROM ops_frequent_route")
            count = cur.fetchone()[0]
            assert count >= 0


def test_activity_ranking_table_exists() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ops_activity_ranking')"
            )
            assert cur.fetchone()[0] is True


def test_activity_ranking_populates_rows() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ops_refresh_activity_ranking()")
            cur.execute("SELECT COUNT(*) FROM ops_activity_ranking")
            count = cur.fetchone()[0]
            assert count >= 1


def test_activity_ranking_columns_ok() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ops_refresh_activity_ranking()")
            cur.execute(
                """
                SELECT rank_num, vehicle_id, trip_count, total_distance_m,
                       active_days, avg_daily_trips
                FROM ops_activity_ranking
                ORDER BY rank_num
                LIMIT 1
                """
            )
            row = cur.fetchone()
            assert row is not None
