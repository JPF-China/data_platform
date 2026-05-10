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


def test_abnormal_running_table_exists() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'risk_abnormal_running')"
            )
            assert cur.fetchone()[0] is True


def test_abnormal_running_populates_rows() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT risk_refresh_abnormal_running()")
            cur.execute("SELECT COUNT(*) FROM risk_abnormal_running")
            count = cur.fetchone()[0]
            assert count >= 0


def test_night_high_risk_table_exists() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'risk_night_high_risk')"
            )
            assert cur.fetchone()[0] is True


def test_night_high_risk_populates_rows() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT risk_refresh_night_high_risk()")
            cur.execute("SELECT COUNT(*) FROM risk_night_high_risk")
            count = cur.fetchone()[0]
            assert count >= 0


def test_risk_summary_table_exists() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'risk_summary')"
            )
            assert cur.fetchone()[0] is True


def test_risk_summary_populates_rows() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT risk_refresh_summary()")
            cur.execute("SELECT COUNT(*) FROM risk_summary")
            count = cur.fetchone()[0]
            assert count >= 1
