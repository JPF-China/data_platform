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


def test_route_comparisons_table_exists() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'route_comparisons')"
            )
            assert cur.fetchone()[0] is True


def test_route_comparisons_insert_read() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM route_comparisons")
            cur.execute(
                """
                INSERT INTO route_comparisons (
                  query_id, strategy_a, strategy_b,
                  distance_m_a, distance_m_b,
                  time_s_a, time_s_b,
                  start_road_id, end_road_id,
                  comparison_meta
                ) VALUES (
                  'test_query_1', 'shortest', 'fastest',
                  5000, 6200,
                  600, 480,
                  'seed_rs_1', 'seed_rs_2',
                  '{"reason": "fastest saves 2 min"}'::jsonb
                )
                """
            )
            cur.execute("SELECT COUNT(*) FROM route_comparisons")
            assert cur.fetchone()[0] == 1


def test_route_strategies_table_exists() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'route_strategies')"
            )
            assert cur.fetchone()[0] is True


def test_route_strategies_insert_read() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM route_strategies")
            cur.execute(
                """
                INSERT INTO route_strategies (
                  strategy_code, strategy_name, description,
                  cost_column, reverse_cost_column,
                  is_active, parameters
                ) VALUES (
                  'fastest_live', 'Fastest Live', 'Real-time speed based routing',
                  'travel_time_s', 'reverse_travel_time_s',
                  false, '{"ttl_minutes": 15}'::jsonb
                )
                """
            )
            cur.execute("SELECT COUNT(*) FROM route_strategies WHERE strategy_code = 'fastest_live'")
            assert cur.fetchone()[0] == 1
