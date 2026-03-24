from __future__ import annotations

from datetime import datetime

from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.services.route_capability_service import get_route_capability

BUCKET_MINUTES = 5


def to_naive_datetime(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt
    return dt.replace(tzinfo=None)


def snap_to_bucket(dt: datetime) -> datetime:
    dt_naive = to_naive_datetime(dt)
    total_minutes = (dt_naive.hour * 60) + dt_naive.minute
    snapped_minutes = (total_minutes // BUCKET_MINUTES) * BUCKET_MINUTES
    return dt_naive.replace(
        hour=snapped_minutes // 60, minute=snapped_minutes % 60, second=0, microsecond=0
    )


def ensure_routing_ready(db: Session) -> None:
    capability = get_route_capability(db)
    if not capability["pgrouting_available"]:
        raise ValueError("pgrouting extension is unavailable")
    if not capability["road_segments_ready"]:
        raise ValueError("road_segments graph is empty; prepare routing assets first")
    if not capability["stats_initialized"]:
        raise ValueError("stats module is not initialized for routing")


def nearest_graph_node(db: Session, lat: float, lon: float) -> int:
    sql = text(
        """
        SELECT node_id
        FROM (
          SELECT
            source_node AS node_id,
            ST_StartPoint(geom) AS node_geom
          FROM road_segments
          WHERE source_node IS NOT NULL

          UNION ALL

          SELECT
            target_node AS node_id,
            ST_EndPoint(geom) AS node_geom
          FROM road_segments
          WHERE target_node IS NOT NULL
        ) AS graph_nodes
        ORDER BY node_geom <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
        LIMIT 1
        """
    )
    row = db.execute(sql, {"lat": lat, "lon": lon}).first()
    if row is None:
        raise ValueError("road_segments graph is empty; prepare routing assets first")
    return int(row[0])


def run_pgr_dijkstra(
    db: Session,
    start_node: int,
    end_node: int,
    *,
    weight: str,
    bucket_start: datetime | None = None,
) -> list[dict]:
    if weight == "distance_m":
        sql = text(
            """
            SELECT seq, path_seq, node, edge, cost, agg_cost
            FROM pgr_dijkstra(
              $$
              SELECT
                id,
                source_node AS source,
                target_node AS target,
                COALESCE(length_m, ST_Length(geom::geography)) AS cost,
                COALESCE(length_m, ST_Length(geom::geography)) AS reverse_cost
              FROM road_segments
              WHERE source_node IS NOT NULL
                AND target_node IS NOT NULL
              $$,
              CAST(:start_node AS bigint),
              CAST(:end_node AS bigint),
              false
            )
            ORDER BY path_seq
            """
        )
    else:
        if bucket_start is None:
            raise ValueError("query bucket start is required for fastest route search")

        sql = text(
            """
            SELECT seq, path_seq, node, edge, cost, agg_cost
            FROM pgr_dijkstra(
              (
                'SELECT '
                || 'rs.id, '
                || 'rs.source_node AS source, '
                || 'rs.target_node AS target, '
                || 'COALESCE(COALESCE(rs.length_m, ST_Length(rs.geom::geography)) / NULLIF(rsb.median_speed_kmh / 3.6, 0), rs.travel_time_s, COALESCE(rs.length_m, ST_Length(rs.geom::geography)) / 8.33) AS cost, '
                || 'COALESCE(COALESCE(rs.length_m, ST_Length(rs.geom::geography)) / NULLIF(rsb.median_speed_kmh / 3.6, 0), rs.travel_time_s, COALESCE(rs.length_m, ST_Length(rs.geom::geography)) / 8.33) AS reverse_cost '
                || 'FROM road_segments rs '
                || 'LEFT JOIN road_speed_bins rsb ON rs.road_id = rsb.road_id '
                || 'AND rsb.bucket_start = '
                || quote_literal(CAST(:bucket_start AS timestamp))
                || '::timestamp '
                || 'WHERE rs.source_node IS NOT NULL '
                || 'AND rs.target_node IS NOT NULL'
              ),
              CAST(:start_node AS bigint),
              CAST(:end_node AS bigint),
              false
            )
            ORDER BY path_seq
            """
        )

    try:
        rows = (
            db.execute(
                sql,
                {
                    "start_node": start_node,
                    "end_node": end_node,
                    "bucket_start": bucket_start,
                },
            )
            .mappings()
            .all()
        )
    except ProgrammingError as exc:
        if "pgr_dijkstra" in str(exc):
            raise ValueError("pgrouting extension is unavailable") from exc
        raise
    return [dict(r) for r in rows]


def has_speed_bins_for_bucket(db: Session, bucket_start: datetime) -> bool:
    row = db.execute(
        text(
            """
            SELECT EXISTS (
              SELECT 1
              FROM road_speed_bins
              WHERE bucket_start = :bucket_start
            )
            """
        ),
        {"bucket_start": bucket_start},
    ).first()
    return bool(row and row[0])
