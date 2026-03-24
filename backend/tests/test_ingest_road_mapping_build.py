import os
from collections.abc import Iterator
from pathlib import Path
from typing import LiteralString, cast
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql

from app.services.road_mapping_service import rebuild_ingest_road_map


def _build_test_db_name() -> str:
    return f"harbin_road_map_{uuid4().hex[:10]}"


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
def road_map_conninfo() -> Iterator[str]:
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


def _seed_data(conninfo: str) -> None:
    with psycopg.connect(conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM ingest_road_map")
            cur.execute("DELETE FROM trip_segments")
            cur.execute("DELETE FROM trip_match_meta")
            cur.execute("DELETE FROM trips")
            cur.execute("DELETE FROM road_segments")

            cur.execute(
                """
                INSERT INTO road_segments (
                  road_id, osm_id, class_id, road_name, highway, oneway,
                  geom, length_m, source_node, target_node, cost, reverse_cost,
                  travel_time_s, source
                ) VALUES
                  (
                    'osm:5001:1001:1002', 5001, 11, 'Road A', 'primary', false,
                    ST_GeomFromText('LINESTRING(126.0000 45.0000,126.0100 45.0000)', 4326),
                    1000.0, 1001, 1002, 120.0, 120.0, 120.0, 'osm'
                  ),
                  (
                    'osm:5002:1002:1003', 5002, 12, 'Road B', 'secondary', false,
                    ST_GeomFromText('LINESTRING(126.0100 45.0000,126.0200 45.0100)', 4326),
                    1500.0, 1002, 1003, 220.0, 220.0, 220.0, 'osm'
                  )
                """
            )

            cur.execute(
                """
                INSERT INTO trips (
                  trip_uid, source_trip_key, devid, trip_date, start_time, end_time,
                  point_count, valid_point_count, is_valid, source_file
                ) VALUES
                  ('map:t1', '1', 'v1', '2015-01-03', '2015-01-03 08:00:00', '2015-01-03 08:10:00', 2, 2, true, 'seed')
                RETURNING id
                """
            )
            trip_id = int(cur.fetchone()[0])

            cur.execute(
                """
                INSERT INTO trip_segments (
                  trip_id, segment_seq, from_point_seq, to_point_seq,
                  start_time, end_time, distance_m, duration_s, avg_speed_kmh,
                  road_id, road_name, start_lat, start_lon, end_lat, end_lon, path_geom
                ) VALUES
                  (
                    %s, 0, 0, 1,
                    '2015-01-03 08:00:00', '2015-01-03 08:05:00', 1000.0, 120.0, 30.0,
                    '5001', 'Road A', 45.0, 126.0, 45.0, 126.01,
                    ST_GeomFromText('LINESTRING(126.0000 45.0000,126.0100 45.0000)', 4326)
                  ),
                  (
                    %s, 1, 1, 2,
                    '2015-01-03 08:05:00', '2015-01-03 08:10:00', 1500.0, 220.0, 24.0,
                    '5002', 'Road B', 45.0, 126.01, 45.01, 126.02,
                    ST_GeomFromText('LINESTRING(126.0100 45.0000,126.0200 45.0100)', 4326)
                  )
                """,
                (trip_id, trip_id),
            )
        conn.commit()


def test_rebuild_ingest_road_map_by_road_id(road_map_conninfo: str) -> None:
    _seed_data(road_map_conninfo)

    with psycopg.connect(road_map_conninfo) as conn:
        with conn.cursor() as cur:
            mapped = rebuild_ingest_road_map(cur)
        conn.commit()

    assert mapped == 2

    with psycopg.connect(road_map_conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT trip_road_id, osm_id, road_segment_id, mapping_source
                FROM ingest_road_map
                ORDER BY trip_road_id
                """
            )
            rows = cur.fetchall()

    assert len(rows) == 2
    assert rows[0][0] == "5001"
    assert rows[0][1] == 5001
    assert isinstance(rows[0][2], int)
    assert rows[0][3] == "road_id"
    assert rows[1][0] == "5002"
    assert rows[1][1] == 5002
    assert isinstance(rows[1][2], int)
    assert rows[1][3] == "road_id"


def test_rebuild_ingest_road_map_is_idempotent(road_map_conninfo: str) -> None:
    _seed_data(road_map_conninfo)

    with psycopg.connect(road_map_conninfo) as conn:
        with conn.cursor() as cur:
            first = rebuild_ingest_road_map(cur)
            second = rebuild_ingest_road_map(cur)
        conn.commit()

    assert first == 2
    assert second == 2

    with psycopg.connect(road_map_conninfo) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM ingest_road_map")
            total = cur.fetchone()

    assert total is not None and total[0] == 2
