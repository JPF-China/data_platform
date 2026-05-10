from sqlalchemy import text
from sqlalchemy.orm import Session


def fetch_daily_summary(db: Session) -> list[dict]:
    rows = (
        db.execute(
            text(
                """
                SELECT metric_date, trip_count, vehicle_count, distance_km, avg_speed_kmh
                FROM ads_dashboard_daily
                ORDER BY metric_date ASC
                """
            )
        )
        .mappings()
        .all()
    )
    return [
        {
            "date": row["metric_date"].isoformat(),
            "trip_count": row["trip_count"],
            "vehicle_count": row["vehicle_count"],
            "distance_km": row["distance_km"],
            "avg_speed_kmh": row["avg_speed_kmh"],
        }
        for row in rows
    ]
