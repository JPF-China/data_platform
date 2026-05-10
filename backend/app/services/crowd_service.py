from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _table_exists(db: Session, table_name: str) -> bool:
    row = db.execute(
        text("SELECT to_regclass(:table_name)"),
        {"table_name": f"public.{table_name}"},
    ).first()
    return bool(row and row[0])


def fetch_crowd_profile_summary(db: Session) -> dict[str, Any]:
    if (
        not _table_exists(db, "tdm_vehicle_profile")
        or not _table_exists(db, "tdm_vehicle_tag")
        or not _table_exists(db, "ads_vehicle_tag_summary")
    ):
        return {
            "total_vehicle_count": 0,
            "tagged_vehicle_count": 0,
            "tag_count": 0,
            "updated_at": None,
            "items": [],
        }

    totals = db.execute(
        text(
            """
            SELECT
              (SELECT COUNT(*) FROM tdm_vehicle_profile) AS total_vehicle_count,
              (SELECT COUNT(DISTINCT vehicle_id) FROM tdm_vehicle_tag) AS tagged_vehicle_count,
              (SELECT MAX(updated_at) FROM ads_vehicle_tag_summary) AS updated_at
            """
        )
    ).mappings().one()
    items = (
        db.execute(
            text(
                """
                SELECT
                  tag_code,
                  tag_name,
                  vehicle_count,
                  avg_trip_count,
                  avg_trip_distance_m,
                  avg_speed_kmh,
                  updated_at
                FROM ads_vehicle_tag_summary
                ORDER BY vehicle_count DESC, tag_code
                """
            )
        )
        .mappings()
        .all()
    )
    return {
        "total_vehicle_count": int(totals["total_vehicle_count"] or 0),
        "tagged_vehicle_count": int(totals["tagged_vehicle_count"] or 0),
        "tag_count": len(items),
        "updated_at": totals["updated_at"].isoformat()
        if totals["updated_at"] is not None
        else None,
        "items": [
            {
                "tag_code": row["tag_code"],
                "tag_name": row["tag_name"],
                "vehicle_count": int(row["vehicle_count"]),
                "avg_trip_count": float(row["avg_trip_count"])
                if row["avg_trip_count"] is not None
                else None,
                "avg_trip_distance_m": float(row["avg_trip_distance_m"])
                if row["avg_trip_distance_m"] is not None
                else None,
                "avg_speed_kmh": float(row["avg_speed_kmh"])
                if row["avg_speed_kmh"] is not None
                else None,
                "updated_at": row["updated_at"].isoformat()
                if row["updated_at"] is not None
                else None,
            }
            for row in items
        ],
    }


def fetch_crowd_vehicles(
    db: Session,
    *,
    tag_code: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    if not _table_exists(db, "tdm_vehicle_profile") or not _table_exists(
        db, "tdm_vehicle_tag"
    ):
        return []

    if tag_code:
        stmt = text(
            """
            WITH vehicle_tags AS (
              SELECT
                vehicle_id,
                array_agg(tag_name ORDER BY tag_name) AS tag_names
              FROM tdm_vehicle_tag
              GROUP BY vehicle_id
            )
            SELECT
              vp.vehicle_id,
              vp.active_days,
              vp.trip_count,
              vp.total_distance_m,
              vp.avg_trip_distance_m,
              vp.avg_speed_kmh,
              vp.dominant_start_hour,
              vt.tag_names
            FROM tdm_vehicle_profile vp
            LEFT JOIN vehicle_tags vt ON vt.vehicle_id = vp.vehicle_id
            WHERE EXISTS (
              SELECT 1
              FROM tdm_vehicle_tag t
              WHERE t.vehicle_id = vp.vehicle_id
                AND t.tag_code = :tag_code
            )
            ORDER BY vp.trip_count DESC, vp.total_distance_m DESC, vp.vehicle_id
            LIMIT :limit
            """
        )
        params: dict[str, Any] = {"tag_code": tag_code, "limit": limit}
    else:
        stmt = text(
            """
            WITH vehicle_tags AS (
              SELECT
                vehicle_id,
                array_agg(tag_name ORDER BY tag_name) AS tag_names
              FROM tdm_vehicle_tag
              GROUP BY vehicle_id
            )
            SELECT
              vp.vehicle_id,
              vp.active_days,
              vp.trip_count,
              vp.total_distance_m,
              vp.avg_trip_distance_m,
              vp.avg_speed_kmh,
              vp.dominant_start_hour,
              vt.tag_names
            FROM tdm_vehicle_profile vp
            LEFT JOIN vehicle_tags vt ON vt.vehicle_id = vp.vehicle_id
            ORDER BY vp.trip_count DESC, vp.total_distance_m DESC, vp.vehicle_id
            LIMIT :limit
            """
        )
        params = {"limit": limit}

    rows = db.execute(stmt, params).mappings().all()
    return [
        {
            "vehicle_id": row["vehicle_id"],
            "active_days": int(row["active_days"]),
            "trip_count": int(row["trip_count"]),
            "total_distance_m": float(row["total_distance_m"]),
            "avg_trip_distance_m": float(row["avg_trip_distance_m"])
            if row["avg_trip_distance_m"] is not None
            else None,
            "avg_speed_kmh": float(row["avg_speed_kmh"])
            if row["avg_speed_kmh"] is not None
            else None,
            "dominant_start_hour": int(row["dominant_start_hour"])
            if row["dominant_start_hour"] is not None
            else None,
            "tags": [str(item) for item in (row["tag_names"] or [])],
        }
        for row in rows
    ]


def _crowd_segment_from_row(row: Any) -> dict[str, Any]:
    return {
        "tag_code": row["tag_code"],
        "tag_name": row["tag_name"],
        "road_id": row["road_id"],
        "road_name": row["road_name"],
        "trip_count": int(row["trip_count"]),
        "vehicle_count": int(row["vehicle_count"]),
        "distance_m": float(row["distance_m"]),
        "avg_speed_kmh": float(row["avg_speed_kmh"])
        if row["avg_speed_kmh"] is not None
        else None,
        "geometry": row["geometry"],
        "updated_at": row["updated_at"].isoformat()
        if row["updated_at"] is not None
        else None,
    }


def fetch_crowd_segments(
    db: Session,
    *,
    tag_code: str | None = None,
    limit: int = 10,
    include_geometry: bool = False,
) -> list[dict[str, Any]]:
    if not _table_exists(db, "ads_vehicle_segments"):
        return []

    params: dict[str, Any] = {"limit": limit}

    if include_geometry and _table_exists(db, "trip_segments"):
        if tag_code:
            params["tag_code"] = tag_code
            stmt = text(
                """
                WITH top_segments AS (
                  SELECT
                    tag_code,
                    tag_name,
                    road_id,
                    road_name,
                    trip_count,
                    vehicle_count,
                    distance_m,
                    avg_speed_kmh,
                    updated_at
                  FROM ads_vehicle_segments
                  WHERE tag_code = :tag_code
                  ORDER BY trip_count DESC, distance_m DESC, road_id
                  LIMIT :limit
                ),
                road_geom AS (
                  SELECT
                    ts.road_id,
                    ST_AsGeoJSON(
                      ST_Multi(ST_LineMerge(ST_Collect(s.path_geom))),
                      6
                    ) AS geometry
                  FROM top_segments ts
                  LEFT JOIN trip_segments s
                    ON s.road_id = ts.road_id
                   AND s.path_geom IS NOT NULL
                  GROUP BY ts.road_id
                )
                SELECT
                  ts.tag_code,
                  ts.tag_name,
                  ts.road_id,
                  ts.road_name,
                  ts.trip_count,
                  ts.vehicle_count,
                  ts.distance_m,
                  ts.avg_speed_kmh,
                  rg.geometry,
                  ts.updated_at
                FROM top_segments ts
                LEFT JOIN road_geom rg ON rg.road_id = ts.road_id
                ORDER BY ts.trip_count DESC, ts.distance_m DESC, ts.road_id
                """
            )
        else:
            stmt = text(
                """
                WITH top_segments AS (
                  SELECT
                    tag_code,
                    tag_name,
                    road_id,
                    road_name,
                    trip_count,
                    vehicle_count,
                    distance_m,
                    avg_speed_kmh,
                    updated_at
                  FROM ads_vehicle_segments
                  ORDER BY trip_count DESC, distance_m DESC, road_id
                  LIMIT :limit
                ),
                road_geom AS (
                  SELECT
                    ts.road_id,
                    ST_AsGeoJSON(
                      ST_Multi(ST_LineMerge(ST_Collect(s.path_geom))),
                      6
                    ) AS geometry
                  FROM top_segments ts
                  LEFT JOIN trip_segments s
                    ON s.road_id = ts.road_id
                   AND s.path_geom IS NOT NULL
                  GROUP BY ts.road_id
                )
                SELECT
                  ts.tag_code,
                  ts.tag_name,
                  ts.road_id,
                  ts.road_name,
                  ts.trip_count,
                  ts.vehicle_count,
                  ts.distance_m,
                  ts.avg_speed_kmh,
                  rg.geometry,
                  ts.updated_at
                FROM top_segments ts
                LEFT JOIN road_geom rg ON rg.road_id = ts.road_id
                ORDER BY ts.trip_count DESC, ts.distance_m DESC, ts.road_id
                """
            )
    else:
        if tag_code:
            params["tag_code"] = tag_code
            stmt = text(
                """
                SELECT
                  tag_code,
                  tag_name,
                  road_id,
                  road_name,
                  trip_count,
                  vehicle_count,
                  distance_m,
                  avg_speed_kmh,
                  NULL::text AS geometry,
                  updated_at
                FROM ads_vehicle_segments
                WHERE tag_code = :tag_code
                ORDER BY trip_count DESC, distance_m DESC, road_id
                LIMIT :limit
                """
            )
        else:
            stmt = text(
                """
                SELECT
                  tag_code,
                  tag_name,
                  road_id,
                  road_name,
                  trip_count,
                  vehicle_count,
                  distance_m,
                  avg_speed_kmh,
                  NULL::text AS geometry,
                  updated_at
                FROM ads_vehicle_segments
                ORDER BY trip_count DESC, distance_m DESC, road_id
                LIMIT :limit
                """
            )

    rows = db.execute(stmt, params).mappings().all()
    return [_crowd_segment_from_row(row) for row in rows]


def fetch_crowd_segment_geometry(
    db: Session,
    *,
    road_id: str,
    simplify_tolerance: float = 0.0001,
) -> dict[str, Any] | None:
    if not road_id:
        return None

    if _table_exists(db, "ads_road_geometry"):
        row = (
            db.execute(
                text(
                    """
                    SELECT
                      road_id,
                      road_name,
                      COALESCE(
                        NULLIF(simplified_geojson, ''),
                        NULLIF(geometry_geojson, ''),
                        CASE
                          WHEN geometry IS NOT NULL THEN ST_AsGeoJSON(geometry, 6)
                          ELSE NULL
                        END
                      ) AS geometry,
                      source_segment_count
                    FROM ads_road_geometry
                    WHERE road_id = :road_id
                    """
                ),
                {"road_id": road_id},
            )
            .mappings()
            .first()
        )
        if row and row["geometry"]:
            return {
                "road_id": row["road_id"],
                "road_name": row["road_name"],
                "geometry": row["geometry"],
                "source": "ads_road_geometry",
                "source_segment_count": int(row["source_segment_count"])
                if row["source_segment_count"] is not None
                else None,
            }

    if _table_exists(db, "heatmap_bins"):
        row = (
            db.execute(
                text(
                    """
                    SELECT
                      road_id,
                      road_name,
                      ST_AsGeoJSON(
                        ST_Multi(
                          ST_SimplifyPreserveTopology(geom, :simplify_tolerance)
                        ),
                        6
                      ) AS geometry,
                      COUNT(*) OVER ()::bigint AS source_segment_count
                    FROM heatmap_bins
                    WHERE road_id = :road_id
                      AND geom IS NOT NULL
                    ORDER BY flow_count DESC, trip_count DESC, time_bucket_start
                    LIMIT 1
                    """
                ),
                {
                    "road_id": road_id,
                    "simplify_tolerance": simplify_tolerance,
                },
            )
            .mappings()
            .first()
        )
        if row and row["geometry"]:
            return {
                "road_id": row["road_id"],
                "road_name": row["road_name"],
                "geometry": row["geometry"],
                "source": "heatmap_bins",
                "source_segment_count": int(row["source_segment_count"])
                if row["source_segment_count"] is not None
                else None,
            }

    if not _table_exists(db, "trip_segments"):
        return None

    row = (
        db.execute(
            text(
                """
                SELECT
                  :road_id AS road_id,
                  MAX(road_name) AS road_name,
                  ST_AsGeoJSON(
                    ST_Multi(
                      ST_SimplifyPreserveTopology(
                        ST_LineMerge(ST_Collect(path_geom)),
                        :simplify_tolerance
                      )
                    ),
                    6
                  ) AS geometry,
                  COUNT(*)::bigint AS source_segment_count
                FROM trip_segments
                WHERE road_id = :road_id
                  AND path_geom IS NOT NULL
                """
            ),
            {
                "road_id": road_id,
                "simplify_tolerance": simplify_tolerance,
            },
        )
        .mappings()
        .first()
    )
    if not row or not row["geometry"]:
        return None
    return {
        "road_id": row["road_id"],
        "road_name": row["road_name"],
        "geometry": row["geometry"],
        "source": "trip_segments",
        "source_segment_count": int(row["source_segment_count"])
        if row["source_segment_count"] is not None
        else None,
    }
