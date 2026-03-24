from __future__ import annotations

from pathlib import Path

import psycopg


def import_bfmap_csv(*, cur: psycopg.Cursor, csv_path: Path) -> int:
    if not csv_path.exists():
        raise FileNotFoundError(f"bfmap csv not found: {csv_path}")

    cur.execute("TRUNCATE bfmap_ways_import RESTART IDENTITY")
    with csv_path.open("r", encoding="utf-8") as f:
        with cur.copy(
            """
            COPY bfmap_ways_import (
              gid, osm_id, class_id, source, target, length, reverse,
              maxspeed_forward, maxspeed_backward, priority, geom
            )
            FROM STDIN WITH (FORMAT csv, HEADER true)
            """
        ) as copy:
            while True:
                chunk = f.read(1024 * 1024)
                if not chunk:
                    break
                copy.write(chunk)

    cur.execute("SELECT COUNT(*) FROM bfmap_ways_import")
    row = cur.fetchone()
    return int(row[0]) if row else 0


def rebuild_road_segments_from_bfmap(cur: psycopg.Cursor) -> int:
    cur.execute("DELETE FROM road_segments WHERE source = 'bfmap'")
    cur.execute(
        "SELECT setval(pg_get_serial_sequence('road_segments', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM road_segments), 0), 1), true)"
    )
    cur.execute(
        """
        INSERT INTO road_segments (
          road_id,
          osm_id,
          class_id,
          road_name,
          highway,
          oneway,
          maxspeed,
          geom,
          length_m,
          source_node,
          target_node,
          cost,
          reverse_cost,
          travel_time_s,
          source
        )
        SELECT
          b.gid::text AS road_id,
          b.osm_id,
          b.class_id,
          NULL AS road_name,
          NULL AS highway,
          CASE WHEN b.reverse = -1 THEN true ELSE false END AS oneway,
          NULL AS maxspeed,
          b.geom,
          COALESCE(b.length, ST_Length(b.geom::geography)) AS length_m,
          b.source AS source_node,
          b.target AS target_node,
          COALESCE(b.length, ST_Length(b.geom::geography)) / 8.33 AS cost,
          CASE
            WHEN b.reverse = -1 THEN -1
            ELSE COALESCE(b.length, ST_Length(b.geom::geography)) / 8.33
          END AS reverse_cost,
          COALESCE(b.length, ST_Length(b.geom::geography)) / 8.33 AS travel_time_s,
          'bfmap' AS source
        FROM bfmap_ways_import b
        WHERE b.gid IS NOT NULL
          AND b.source IS NOT NULL
          AND b.target IS NOT NULL
          AND b.geom IS NOT NULL
        ON CONFLICT (road_id) DO UPDATE
          SET
            osm_id = EXCLUDED.osm_id,
            class_id = EXCLUDED.class_id,
            road_name = EXCLUDED.road_name,
            highway = EXCLUDED.highway,
            oneway = EXCLUDED.oneway,
            maxspeed = EXCLUDED.maxspeed,
            geom = EXCLUDED.geom,
            length_m = EXCLUDED.length_m,
            source_node = EXCLUDED.source_node,
            target_node = EXCLUDED.target_node,
            cost = EXCLUDED.cost,
            reverse_cost = EXCLUDED.reverse_cost,
            travel_time_s = EXCLUDED.travel_time_s,
            source = EXCLUDED.source
        """
    )
    return cur.rowcount
