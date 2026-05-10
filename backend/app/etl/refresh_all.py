"""Orchestrate all module refreshes in dependency order.

Modules and their dependencies::

    stats      →  trips, trip_segments
    ops        →  trips, trip_segments (same as stats)
    risk       →  trips, trip_segments (same as stats)
    report     →  stats, ops, risk
    governance →  all tables

Execution order:  stats → ops → risk → report → governance

Usage::
    python -m app.etl.refresh_all
    python -m app.etl.refresh_all --modules stats,ops,risk
"""
from __future__ import annotations

import argparse
import sys

from app.etl.refresh_base import get_connection, progress

MODULES = [
    ("stats", "app.etl.refresh_stats"),
    ("ops", "app.etl.refresh_ops"),
    ("risk", "app.etl.refresh_risk"),
    ("report", "app.etl.refresh_report"),
    ("governance", "app.etl.refresh_governance"),
]


def _load_refresh_fn(module_path: str):
    import importlib

    mod = importlib.import_module(module_path)
    return mod.refresh


def refresh_all(modules: list[str] | None = None) -> None:
    """Run all or selected module refreshes in dependency order.

    *modules* is a filter list of module names to run (default: all).
    """
    selected = modules or [name for name, _ in MODULES]

    conn = get_connection()
    progress(f"refresh_all: starting (modules={selected})")
    try:
        for name, mod_path in MODULES:
            if name not in selected:
                progress(f"  skip {name}")
                continue
            fn = _load_refresh_fn(mod_path)
            fn(conn=conn)  # reuse single connection
        progress("refresh_all: complete")
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run all or selected module refreshes.")
    parser.add_argument(
        "--modules",
        default=None,
        help="Comma-separated module names (stats,ops,risk,report,governance). Default: all.",
    )
    args = parser.parse_args()

    selected = None
    if args.modules:
        selected = [m.strip() for m in args.modules.split(",")]
        valid = set(n for n, _ in MODULES)
        for m in selected:
            if m not in valid:
                progress(f"ERROR: unknown module '{m}'. valid: {sorted(valid)}")
                sys.exit(2)

    refresh_all(modules=selected)


if __name__ == "__main__":
    main()
