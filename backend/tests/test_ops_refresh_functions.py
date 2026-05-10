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


def test_ops_refresh_vehicle_profile_populates_rows() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ops_refresh_vehicle_profile()")
            cur.execute("SELECT COUNT(*) FROM ops_vehicle_profile")
            count = cur.fetchone()[0]
            assert count >= 1


def test_ops_refresh_vehicle_tags_populates_rows() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ops_refresh_vehicle_profile()")
            cur.execute("SELECT ops_refresh_vehicle_tags()")
            cur.execute("SELECT COUNT(*) FROM ops_vehicle_tag")
            count = cur.fetchone()[0]
            assert count >= 0
            cur.execute("SELECT ops_refresh_vehicle_tag_summary()")
            cur.execute("SELECT COUNT(*) FROM ops_vehicle_tag_summary")
            cur.fetchone()
