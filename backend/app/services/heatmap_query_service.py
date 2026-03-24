from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.orm import Session


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
