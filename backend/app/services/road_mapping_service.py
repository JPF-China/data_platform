from __future__ import annotations

import psycopg


def rebuild_ingest_road_map(cur: psycopg.Cursor) -> int:
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_trip_segments_path_geom_gist
        ON trip_segments USING gist(path_geom)
        """
    )
    cur.execute("TRUNCATE ingest_road_map RESTART IDENTITY")
    cur.execute(
        """
        INSERT INTO ingest_road_map (
          trip_road_id,
          osm_id,
          road_segment_id,
          mapping_source,
          confidence,
          mapping_version,
          updated_at
        )
        SELECT
          src.trip_road_id,
          rs.osm_id,
          rs.id AS road_segment_id,
          'road_id' AS mapping_source,
          1.0 AS confidence,
          'v1' AS mapping_version,
          now() AS updated_at
        FROM (
          SELECT DISTINCT NULLIF(trim(s.road_id), '') AS trip_road_id
          FROM trip_segments s
          WHERE s.road_id IS NOT NULL
            AND trim(s.road_id) <> ''
        ) AS src
        JOIN road_segments rs
          ON (
            (rs.source = 'bfmap' AND rs.road_id = src.trip_road_id)
            OR
            (rs.source = 'osm' AND rs.osm_id::text = src.trip_road_id)
          )
        ON CONFLICT (trip_road_id, osm_id) DO UPDATE
          SET
            road_segment_id = EXCLUDED.road_segment_id,
            mapping_source = EXCLUDED.mapping_source,
            confidence = EXCLUDED.confidence,
            mapping_version = EXCLUDED.mapping_version,
            updated_at = now()
        """
    )
    direct_count = cur.rowcount

    if direct_count > 0:
        return direct_count

    cur.execute(
        """
        WITH seg AS (
          SELECT DISTINCT ON (NULLIF(trim(s.road_id), ''))
            NULLIF(trim(s.road_id), '') AS trip_road_id,
            ST_LineInterpolatePoint(s.path_geom, 0.5)::geometry(Point, 4326) AS seg_mid
          FROM trip_segments s
          WHERE s.path_geom IS NOT NULL
            AND s.road_id IS NOT NULL
            AND trim(s.road_id) <> ''
          ORDER BY NULLIF(trim(s.road_id), ''), s.id
        ),
        unmapped AS (
          SELECT seg.trip_road_id, seg.seg_mid
          FROM seg
          LEFT JOIN ingest_road_map m ON m.trip_road_id = seg.trip_road_id
          WHERE m.id IS NULL
        )
        INSERT INTO ingest_road_map (
          trip_road_id,
          osm_id,
          road_segment_id,
          mapping_source,
          confidence,
          mapping_version,
          updated_at
        )
        SELECT
          u.trip_road_id,
          c.osm_id,
          c.road_segment_id,
          'geom_nearest' AS mapping_source,
          GREATEST(0.2, LEAST(0.95, 1.0 - (c.dist_m / 80.0))) AS confidence,
          'v1' AS mapping_version,
          now() AS updated_at
        FROM unmapped u
        JOIN LATERAL (
          SELECT
            rs.osm_id,
            rs.id AS road_segment_id,
            ST_Distance(u.seg_mid::geography, rs.geom::geography) AS dist_m
          FROM road_segments rs
          WHERE rs.source IN ('osm', 'bfmap')
            AND rs.geom IS NOT NULL
            AND rs.geom && ST_Expand(u.seg_mid, 0.005)
          ORDER BY rs.geom <-> u.seg_mid
          LIMIT 1
        ) c ON true
        WHERE c.dist_m <= 80
        ON CONFLICT (trip_road_id, osm_id) DO NOTHING
        """
    )
    return direct_count + cur.rowcount
