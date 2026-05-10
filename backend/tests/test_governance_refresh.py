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


def test_governance_refresh_asset_catalog() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT governance_refresh_assets()")
            cur.execute("SELECT COUNT(*) FROM meta_asset_catalog")
            count = cur.fetchone()[0]
            assert count >= 1


def test_governance_refresh_available_time_range() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM meta_available_time_range")
            cur.execute("SELECT governance_refresh_time_ranges()")
            cur.execute("SELECT COUNT(*) FROM meta_available_time_range")
            count = cur.fetchone()[0]
            assert count >= 1


def test_governance_refresh_job_status() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT governance_refresh_job_status()")
            cur.execute("SELECT COUNT(*) FROM meta_job_status")
            count = cur.fetchone()[0]
            assert count >= 0


def test_governance_refresh_data_quality() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT governance_refresh_quality_checks()")
            cur.execute("SELECT COUNT(*) FROM meta_data_quality_check")
            count = cur.fetchone()[0]
            assert count >= 1


def test_governance_refresh_portal_summary() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT governance_refresh_assets()")
            cur.execute("SELECT governance_refresh_portal_summary()")
            cur.execute("SELECT COUNT(*) FROM ads_asset_portal_summary")
            count = cur.fetchone()[0]
            assert count >= 1
