from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import LiteralString, cast
from uuid import uuid4

import numpy as np
import psycopg
import pytest
from psycopg import sql

from app.services.ingest_service import TripRow, insert_raw_points, upsert_trips_batch


def _build_test_db_name() -> str:
    return f"harbin_ingest_valid_{uuid4().hex[:10]}"


def _admin_conninfo() -> str:
    return os.environ.get(
        "DB_ADMIN_CONNINFO", "dbname=postgres user=apple host=localhost port=5432"
    )


def _test_conninfo(db_name: str) -> str:
    return f"dbname={db_name} user=apple host=localhost port=5432"


def _apply_schema(conninfo: str) -> None:
    sql_dir = Path(__file__).resolve().parents[2] / "infra" / "postgres"
    with psycopg.connect(conninfo) as conn:
        with conn.cursor() as cur:
            for name in ("init.sql", "ingest_schema.sql", "stats_schema.sql"):
                schema_sql = cast(
                    LiteralString, (sql_dir / name).read_text(encoding="utf-8")
                )
                cur.execute(schema_sql)
        conn.commit()


@pytest.fixture(scope="module")
def ingest_validation_conninfo() -> Iterator[str]:
    db_name = _build_test_db_name()
    conninfo = _test_conninfo(db_name)

    with psycopg.connect(_admin_conninfo(), autocommit=True) as admin_conn:
        with admin_conn.cursor() as cur:
            cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db_name)))

    try:
        _apply_schema(conninfo)
        yield conninfo
    finally:
        with psycopg.connect(_admin_conninfo(), autocommit=True) as admin_conn:
            with admin_conn.cursor() as cur:
                cur.execute(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s",
                    (db_name,),
                )
                cur.execute(
                    sql.SQL("DROP DATABASE IF EXISTS {}").format(
                        sql.Identifier(db_name)
                    )
                )


def test_trip_upsert_deduplicates_by_trip_uid(ingest_validation_conninfo: str) -> None:
    with psycopg.connect(ingest_validation_conninfo) as conn:
        with conn.cursor() as cur:
            first = TripRow(
                trip_uid="valid:trip:1",
                source_trip_key="1",
                devid="dev-1",
                trip_date="2015-01-03",
                start_time=datetime(2015, 1, 3, 8, 0),
                end_time=datetime(2015, 1, 3, 8, 5),
                point_count=2,
                valid_point_count=2,
                is_valid=True,
                source_file="seed",
            )
            second = TripRow(
                trip_uid="valid:trip:1",
                source_trip_key="1-updated",
                devid="dev-1",
                trip_date="2015-01-03",
                start_time=datetime(2015, 1, 3, 8, 0),
                end_time=datetime(2015, 1, 3, 8, 10),
                point_count=3,
                valid_point_count=3,
                is_valid=True,
                source_file="seed-updated",
            )

            first_map = upsert_trips_batch(cur, [first])
            second_map = upsert_trips_batch(cur, [second])
            assert "valid:trip:1" in first_map
            assert "valid:trip:1" in second_map
            assert first_map["valid:trip:1"] == second_map["valid:trip:1"]

            cur.execute(
                "SELECT COUNT(*) FROM trips WHERE trip_uid = %s", ("valid:trip:1",)
            )
            assert cur.fetchone() == (1,)

            cur.execute(
                "SELECT source_trip_key, point_count, source_file FROM trips WHERE trip_uid = %s",
                ("valid:trip:1",),
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "1-updated"
            assert row[1] == 3
            assert row[2] == "seed-updated"
        conn.commit()


def test_insert_raw_points_marks_invalid_coordinates(
    ingest_validation_conninfo: str,
) -> None:
    with psycopg.connect(ingest_validation_conninfo) as conn:
        with conn.cursor() as cur:
            trip_map = upsert_trips_batch(
                cur,
                [
                    TripRow(
                        trip_uid="valid:trip:2",
                        source_trip_key="2",
                        devid="dev-2",
                        trip_date="2015-01-03",
                        start_time=datetime(2015, 1, 3, 9, 0),
                        end_time=datetime(2015, 1, 3, 9, 10),
                        point_count=2,
                        valid_point_count=1,
                        is_valid=True,
                        source_file="seed",
                    )
                ],
            )
            trip_id = trip_map["valid:trip:2"]

            insert_raw_points(
                cur,
                trip_id=trip_id,
                devid="dev-2",
                lats=np.array([45.756, 95.0], dtype=np.float64),
                lons=np.array([126.642, 200.0], dtype=np.float64),
                speeds=np.array([30.0, 20.0], dtype=np.float64),
                tms=np.array([1420243200, 1420243260], dtype=np.int64),
            )

            cur.execute(
                """
                SELECT point_seq, is_valid, invalid_reason
                FROM trip_points_raw
                WHERE trip_id = %s
                ORDER BY point_seq
                """,
                (trip_id,),
            )
            rows = cur.fetchall()
            assert len(rows) == 2
            assert rows[0] == (0, True, None)
            assert rows[1] == (1, False, "invalid_coordinate")
        conn.commit()


def test_insert_raw_points_chunk_writes_complete_rows(
    ingest_validation_conninfo: str,
) -> None:
    with psycopg.connect(ingest_validation_conninfo) as conn:
        with conn.cursor() as cur:
            trip_map = upsert_trips_batch(
                cur,
                [
                    TripRow(
                        trip_uid="valid:trip:3",
                        source_trip_key="3",
                        devid="dev-3",
                        trip_date="2015-01-03",
                        start_time=datetime(2015, 1, 3, 10, 0),
                        end_time=datetime(2015, 1, 3, 10, 30),
                        point_count=1000,
                        valid_point_count=1000,
                        is_valid=True,
                        source_file="seed",
                    )
                ],
            )
            trip_id = trip_map["valid:trip:3"]

            n = 1000
            lats = np.linspace(45.7000, 45.7999, n, dtype=np.float64)
            lons = np.linspace(126.6000, 126.6999, n, dtype=np.float64)
            speeds = np.full(n, 30.0, dtype=np.float64)
            tms = np.arange(1420243200, 1420243200 + n, dtype=np.int64)

            insert_raw_points(
                cur,
                trip_id=trip_id,
                devid="dev-3",
                lats=lats,
                lons=lons,
                speeds=speeds,
                tms=tms,
            )

            cur.execute(
                "SELECT COUNT(*) FROM trip_points_raw WHERE trip_id = %s", (trip_id,)
            )
            count_row = cur.fetchone()
            assert count_row is not None
            assert count_row[0] == n

            cur.execute(
                "SELECT MIN(point_seq), MAX(point_seq) FROM trip_points_raw WHERE trip_id = %s",
                (trip_id,),
            )
            seq_row = cur.fetchone()
            assert seq_row == (0, n - 1)
        conn.commit()


def test_trip_batch_upsert_uses_stage_table_path(
    ingest_validation_conninfo: str,
) -> None:
    with psycopg.connect(ingest_validation_conninfo) as conn:
        with conn.cursor() as cur:
            rows = [
                TripRow(
                    trip_uid=f"stage:trip:{i}",
                    source_trip_key=str(i),
                    devid="stage-dev",
                    trip_date="2015-01-03",
                    start_time=datetime(2015, 1, 3, 8, 0),
                    end_time=datetime(2015, 1, 3, 8, 1),
                    point_count=1,
                    valid_point_count=1,
                    is_valid=True,
                    source_file="seed",
                )
                for i in range(20)
            ]
            upsert_trips_batch(cur, rows)
            cur.execute("SELECT to_regclass('pg_temp.trips_stage') IS NOT NULL")
            stage_exists = cur.fetchone()
            assert stage_exists is not None
            assert stage_exists[0] is True
        conn.commit()


def test_trip_batch_upsert_deduplicates_with_latest_stage_row(
    ingest_validation_conninfo: str,
) -> None:
    with psycopg.connect(ingest_validation_conninfo) as conn:
        with conn.cursor() as cur:
            rows = [
                TripRow(
                    trip_uid="stage:dedup:1",
                    source_trip_key="old",
                    devid="v-old",
                    trip_date="2015-01-03",
                    start_time=datetime(2015, 1, 3, 8, 0),
                    end_time=datetime(2015, 1, 3, 8, 1),
                    point_count=1,
                    valid_point_count=1,
                    is_valid=True,
                    source_file="old",
                ),
                TripRow(
                    trip_uid="stage:dedup:1",
                    source_trip_key="new",
                    devid="v-new",
                    trip_date="2015-01-03",
                    start_time=datetime(2015, 1, 3, 8, 0),
                    end_time=datetime(2015, 1, 3, 8, 2),
                    point_count=2,
                    valid_point_count=2,
                    is_valid=True,
                    source_file="new",
                ),
            ]
            upsert_trips_batch(cur, rows)
            cur.execute(
                """
                SELECT source_trip_key, devid, point_count, source_file
                FROM trips
                WHERE trip_uid = 'stage:dedup:1'
                """
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "new"
            assert row[1] == "v-new"
            assert row[2] == 2
            assert row[3] == "new"
        conn.commit()
