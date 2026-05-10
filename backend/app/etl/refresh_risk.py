"""Refresh risk monitoring tables.

Covers: risk_driver_fatigue, risk_driver_fatigue_event,
risk_abnormal_running, risk_night_high_risk, risk_summary.

Depends on: trips + trip_segments (already ingested).

Usage::
    python -m app.etl.refresh_risk
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
    ("driver_fatigue", "risk_refresh_driver_fatigue()"),
    ("abnormal_running", "risk_refresh_abnormal_running()"),
    ("night_high_risk", "risk_refresh_night_high_risk()"),
    ("risk_summary", "risk_refresh_summary()"),
]


def refresh(conn: psycopg.Connection | None = None) -> None:
    _close = conn is None
    if conn is None:
        conn = get_connection()
    try:
        with_module_header("risk")
        for label, func in STEPS:
            run_sql(conn, func, label)
        with_module_footer("risk")
    finally:
        if _close:
            conn.close()


def main() -> None:
    refresh()


if __name__ == "__main__":
    cli_wrapper(main)
