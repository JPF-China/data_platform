"""Refresh operations reporting tables.

Covers: report_daily_summary, report_weekly_summary.

Depends on: daily_metrics + ops_vehicle_profile + risk_* tables.

Usage::
    python -m app.etl.refresh_report
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
    ("daily_summary", "report_refresh_daily()"),
    ("weekly_summary", "report_refresh_weekly()"),
]


def refresh(conn: psycopg.Connection | None = None) -> None:
    _close = conn is None
    if conn is None:
        conn = get_connection()
    try:
        with_module_header("report")
        for label, func in STEPS:
            run_sql(conn, func, label)
        with_module_footer("report")
    finally:
        if _close:
            conn.close()


def main() -> None:
    refresh()


if __name__ == "__main__":
    cli_wrapper(main)
