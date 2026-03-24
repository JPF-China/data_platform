import json

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas import RouteCompareRequest, RoutePlan
from app.services.route_search_service import to_naive_datetime


def persist_route(
    db: Session,
    payload: RouteCompareRequest,
    route_type: str,
    route_data: RoutePlan,
) -> None:
    geom_sql = (
        "(SELECT ST_Multi(ST_LineMerge(ST_Collect(seg.geom ORDER BY seg.ord))) "
        "FROM ("
        "  SELECT ST_GeomFromText(value, 4326) AS geom, ord "
        "  FROM jsonb_array_elements_text(CAST(:wkt_segments AS jsonb)) WITH ORDINALITY AS t(value, ord)"
        ") AS seg)"
    )
    if not route_data.path_wkt_segments:
        geom_sql = (
            "ST_Multi(ST_MakeLine(ARRAY[ST_SetSRID(ST_MakePoint(:start_lon, :start_lat),4326),"
            "ST_SetSRID(ST_MakePoint(:end_lon, :end_lat),4326)]))"
        )

    sql = text(
        f"""
        INSERT INTO route_results (
          query_time, start_point, end_point, route_type,
          distance_m, estimated_time_s, path_geom, path_json, meta
        ) VALUES (
          :query_time,
          ST_SetSRID(ST_MakePoint(:start_lon, :start_lat), 4326),
          ST_SetSRID(ST_MakePoint(:end_lon, :end_lat), 4326),
          :route_type,
          :distance_m,
          :estimated_time_s,
          {geom_sql},
          CAST(:path_json AS jsonb),
          CAST(:meta AS jsonb)
        )
        """
    )
    db.execute(
        sql,
        {
            "query_time": to_naive_datetime(payload.query_time),
            "start_lon": payload.start_point.lon,
            "start_lat": payload.start_point.lat,
            "end_lon": payload.end_point.lon,
            "end_lat": payload.end_point.lat,
            "route_type": route_type,
            "distance_m": route_data.distance_m,
            "estimated_time_s": route_data.estimated_time_s,
            "wkt_segments": json.dumps(route_data.path_wkt_segments),
            "path_json": json.dumps(
                {"edges": [edge.model_dump() for edge in route_data.edges]}
            ),
            "meta": json.dumps({"source": "pgrouting", "weight": route_data.weight}),
        },
    )
