"""Refresh stats aggregation tables.

Covers: daily_metrics, daily_distance_boxplot, daily_speed_boxplot,
heatmap_bins, road_speed_bins, table_row_stats, hourly_metrics, road_daily_stats.

Usage::
    python -m app.etl.refresh_stats
"""
from __future__ import annotations

import psycopg
from app.etl.refresh_base import (
    cli_wrapper,
    get_connection,
    progress,
    run_python,
    run_sql,
    with_module_footer,
    with_module_header,
)
from app.services import stats_service

STEPS: list[tuple[str, str | None]] = [
    # ── original 6 (Python implementations) ──
    ("daily_metrics", None),
    ("daily_distance_boxplot", None),
    ("daily_speed_boxplot", None),
    ("heatmap_bins", None),
    ("road_speed_bins", None),
    ("table_row_stats", None),
    # ── extended 2 (SQL functions) ──
    ("hourly_metrics", "stats_refresh_hourly_metrics()"),
    ("road_daily_stats", "stats_refresh_road_daily_stats()"),
]

_PYTHON_STEPS: dict[str, object] = {
    "daily_metrics": stats_service.aggregate_daily_metrics,
    "daily_distance_boxplot": stats_service.aggregate_daily_distance_boxplot,
    "daily_speed_boxplot": stats_service.aggregate_daily_speed_boxplot,
    "heatmap_bins": stats_service.aggregate_heatmap_bins,
    "road_speed_bins": stats_service.aggregate_road_speed_bins,
    "table_row_stats": stats_service.aggregate_table_row_stats,
}


def refresh(conn: psycopg.Connection | None = None) -> None:
    """Run all stats refreshes in a single transaction per step."""
    _close = conn is None
    if conn is None:
        conn = get_connection()

    try:
        with_module_header("stats")
        for label, sql_func in STEPS:
            if sql_func is None:
                fn = _PYTHON_STEPS[label]
                run_python(conn, fn, label)  # type: ignore[arg-type]
            else:
                run_sql(conn, sql_func, label)
        with_module_footer("stats")
    finally:
        if _close:
            conn.close()


def main() -> None:
    refresh()


if __name__ == "__main__":
    cli_wrapper(main)
