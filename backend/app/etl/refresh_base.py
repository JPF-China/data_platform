"""Common utilities for per-module refresh scripts.

Each refresh module can run independently or be called
programmatically from an orchestrator.
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from typing import Callable

import psycopg
from app.core.config import settings


def get_connection() -> psycopg.Connection:
    """Open a direct psycopg connection using the configured conninfo."""
    return psycopg.connect(settings.db_conninfo)


def progress(msg: str) -> None:
    timestamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{timestamp}] {msg}", flush=True)


def run_sql(conn: psycopg.Connection, func_name: str, label: str) -> None:
    """Execute a parameterless SQL function and commit.

    Used for PL/pgSQL refresh functions that live in the database
    (e.g. ``ops_refresh_vehicle_profile()``).
    """
    progress(f"  {label} …")
    with conn.cursor() as cur:
        cur.execute(f"SELECT {func_name}")
    conn.commit()
    progress(f"  {label} ✓")


def run_python(
    conn: psycopg.Connection, fn: Callable[[psycopg.Cursor], None], label: str
) -> None:
    """Execute a Python refresh function that takes a cursor, then commit."""
    progress(f"  {label} …")
    with conn.cursor() as cur:
        fn(cur)
    conn.commit()
    progress(f"  {label} ✓")


def with_module_header(name: str) -> None:
    progress(f"=== {name} ===")


def with_module_footer(name: str) -> None:
    progress(f"=== {name} complete ===")


def run_module(
    name: str,
    steps: list[tuple[str, Callable[..., None]]],
    conn: psycopg.Connection | None = None,
) -> None:
    """Run a named refresh module.

    If *conn* is provided, the caller manages the connection lifecycle.
    Otherwise a temporary connection is created and closed.
    """
    close = conn is None
    if conn is None:
        conn = get_connection()

    try:
        with_module_header(name)
        for label, fn in steps:
            fn(conn) if "cur" not in fn.__code__.co_varnames else fn(conn.cursor())
    finally:
        if close:
            conn.close()

    with_module_footer(name)


def cli_wrapper(run_fn: Callable[[], None]) -> None:
    """Boiler-plate for ``if __name__ == '__main__'`` blocks."""
    try:
        run_fn()
    except Exception as exc:
        progress(f"FATAL: {exc}")
        sys.exit(1)
