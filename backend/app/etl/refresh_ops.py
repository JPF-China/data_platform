"""Refresh ops profile tables.

Covers: ops_vehicle_profile, ops_vehicle_tag, ops_vehicle_tag_summary,
ops_frequent_route, ops_activity_ranking.

Depends on: trips + trip_segments (already ingested).

Usage::
    python -m app.etl.refresh_ops
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
    ("vehicle_profile", "ops_refresh_vehicle_profile()"),
    ("vehicle_tags", "ops_refresh_vehicle_tags()"),
    ("vehicle_tag_summary", "ops_refresh_vehicle_tag_summary()"),
    ("frequent_routes", "ops_refresh_frequent_routes()"),
    ("activity_ranking", "ops_refresh_activity_ranking()"),
]


def refresh(conn: psycopg.Connection | None = None) -> None:
    _close = conn is None
    if conn is None:
        conn = get_connection()
    try:
        with_module_header("ops")
        for label, func in STEPS:
            run_sql(conn, func, label)
        with_module_footer("ops")
    finally:
        if _close:
            conn.close()


def main() -> None:
    refresh()


if __name__ == "__main__":
    cli_wrapper(main)
