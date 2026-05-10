from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.orm import Session


def fetch_vehicle_path(
    db: Session,
    vehicle_id: str,
    metric_date: date | None = None,
) -> list[dict]:
    params: dict[str, object] = {"vid": vehicle_id}
    date_filter = ""
    if metric_date:
        date_filter = " AND t.trip_date = :mdate"
        params["mdate"] = metric_date
    sql = text(f"""
        SELECT
          s.road_id,
          s.road_name,
          s.avg_speed_kmh,
          s.start_time,
          s.end_time,
          s.distance_m,
          ST_AsGeoJSON(s.path_geom) AS geom_json
        FROM trip_segments s
        JOIN trips t ON t.id = s.trip_id
        WHERE t.devid = :vid
          AND t.is_valid = true
          AND s.path_geom IS NOT NULL{date_filter}
        ORDER BY s.start_time
    """)
    rows = db.execute(sql, params).mappings().all()
    return [
        {
            "road_id": r["road_id"],
            "road_name": r["road_name"],
            "avg_speed_kmh": float(r["avg_speed_kmh"]) if r["avg_speed_kmh"] else None,
            "start_time": r["start_time"].isoformat(),
            "end_time": r["end_time"].isoformat(),
            "distance_m": float(r["distance_m"]),
            "geometry": r["geom_json"],
        }
        for r in rows
    ]


def fetch_heatmap(
    db: Session,
    metric_date: date,
    bucket_start: datetime,
    min_lat: float | None = None,
    min_lon: float | None = None,
    max_lat: float | None = None,
    max_lon: float | None = None,
) -> list[dict]:
    where_extra = ""
    params: dict[str, object] = {
        "metric_date": metric_date,
        "bucket_start": bucket_start,
    }

    if None not in (min_lat, min_lon, max_lat, max_lon):
        where_extra = " AND ST_Intersects(geom, ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326))"
        params.update(
            {
                "min_lat": min_lat,
                "min_lon": min_lon,
                "max_lat": max_lat,
                "max_lon": max_lon,
            }
        )

    sql = text(
        f"""
        SELECT
          road_id,
          road_name,
          trip_count,
          vehicle_count,
          flow_count,
          distance_m,
          time_bucket_start,
          time_bucket_end,
          ST_AsGeoJSON(geom) AS geom_json
        FROM heatmap_bins
        WHERE metric_date = :metric_date
          AND time_bucket_start = :bucket_start
          {where_extra}
        ORDER BY flow_count DESC
        """
    )
    rows = db.execute(sql, params).mappings().all()
    output = []
    for r in rows:
        output.append(
            {
                "road_id": r["road_id"],
                "road_name": r["road_name"],
                "trip_count": r["trip_count"],
                "vehicle_count": r["vehicle_count"],
                "flow_count": r["flow_count"],
                "distance_m": r["distance_m"],
                "time_bucket_start": r["time_bucket_start"].isoformat(),
                "time_bucket_end": r["time_bucket_end"].isoformat(),
                "geometry": r["geom_json"],
            }
        )
    return output


def fetch_heatmap_buckets(db: Session, metric_date: date) -> list[str]:
    sql = text(
        """
        SELECT DISTINCT time_bucket_start
        FROM heatmap_bins
        WHERE metric_date = :metric_date
        ORDER BY time_bucket_start
        """
    )
    rows = db.execute(sql, {"metric_date": metric_date}).all()
    return [row[0].isoformat() for row in rows]
