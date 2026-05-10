"""Refresh data governance tables.

Covers: meta_asset_catalog, meta_available_time_range, meta_job_status,
meta_data_quality_check, ads_asset_portal_summary.

Depends on: all data tables (reads table metadata from pg_catalog).

Usage::
    python -m app.etl.refresh_governance
"""
from __future__ import annotations

import psycopg
from app.etl.refresh_base import (
    cli_wrapper,
    get_connection,
    run_sql,
    with_module_footer,
    with_module_header,
)

STEPS = [
    ("assets", "governance_refresh_assets()"),
    ("time_ranges", "governance_refresh_time_ranges()"),
    ("job_status", "governance_refresh_job_status()"),
    ("quality_checks", "governance_refresh_quality_checks()"),
    ("portal_summary", "governance_refresh_portal_summary()"),
]


def refresh(conn: psycopg.Connection | None = None) -> None:
    _close = conn is None
    if conn is None:
        conn = get_connection()
    try:
        with_module_header("governance")
        for label, func in STEPS:
            run_sql(conn, func, label)
        with_module_footer("governance")
    finally:
        if _close:
            conn.close()


def main() -> None:
    refresh()


if __name__ == "__main__":
    cli_wrapper(main)
