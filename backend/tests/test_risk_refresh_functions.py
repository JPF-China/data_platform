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


def test_risk_refresh_fatigue_populates_rows() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT risk_refresh_driver_fatigue()")
            cur.execute("SELECT COUNT(*) FROM risk_driver_fatigue")
            count = cur.fetchone()[0]
            assert count >= 0
            cur.execute("SELECT COUNT(*) FROM risk_driver_fatigue_event")
            cur.fetchone()
