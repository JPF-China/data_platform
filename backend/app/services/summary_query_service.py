from sqlalchemy.orm import Session

from app.db import models


def fetch_daily_summary(db: Session) -> list[dict]:
    rows = (
        db.query(models.DailyMetric)
        .order_by(models.DailyMetric.metric_date.asc())
        .all()
    )
    return [
        {
            "date": row.metric_date.isoformat(),
            "trip_count": row.trip_count,
            "vehicle_count": row.vehicle_count,
            "distance_km": row.distance_km,
            "avg_speed_kmh": row.avg_speed_kmh,
        }
        for row in rows
    ]
