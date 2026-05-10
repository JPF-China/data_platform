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


def test_governance_tables_exist() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            for table_name in (
                "meta_asset_catalog",
                "meta_available_time_range",
                "meta_job_status",
                "meta_data_quality_check",
                "ads_asset_portal_summary",
            ):
                assert _table_exists(cur, table_name)


def test_governance_tables_basic_write() -> None:
    with psycopg.connect(_conninfo()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO meta_asset_catalog (
                  asset_key, display_name, asset_layer, asset_type, source_table,
                  status, row_count, description
                ) VALUES (
                  'test_asset', 'Test Asset', 'ADS', 'table', 'daily_metrics',
                  'ready', 1, 'test'
                )
                ON CONFLICT (asset_key) DO UPDATE SET
                  status = EXCLUDED.status,
                  row_count = EXCLUDED.row_count
                """
            )
            cur.execute(
                """
                INSERT INTO meta_available_time_range (
                  asset_key, min_date, max_date, available_dates, details
                ) VALUES (
                  'summary_dates', '2015-01-03', '2015-01-03', '["2015-01-03"]'::jsonb, '{}'
                )
                ON CONFLICT (asset_key) DO UPDATE SET
                  available_dates = EXCLUDED.available_dates
                """
            )
            cur.execute(
                """
                INSERT INTO meta_job_status (
                  job_name, status, message
                ) VALUES (
                  'pipeline', 'success', 'seed'
                )
                ON CONFLICT (job_name) DO UPDATE SET
                  status = EXCLUDED.status,
                  message = EXCLUDED.message
                """
            )
            cur.execute(
                """
                INSERT INTO meta_data_quality_check (
                  check_key, status, details
                ) VALUES (
                  'daily_metrics_ready', 'pass', '{}'
                )
                ON CONFLICT (check_key) DO UPDATE SET
                  status = EXCLUDED.status
                """
            )
            cur.execute("TRUNCATE ads_asset_portal_summary")
            cur.execute(
                """
                INSERT INTO ads_asset_portal_summary (
                  asset_layer, asset_count, ready_count, total_rows
                ) VALUES ('ADS', 1, 1, 1)
                """
            )
        conn.commit()
