from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import models


def fetch_daily_trip_count(db: Session) -> list[dict]:
    rows = (
        db.query(models.DailyMetric.metric_date, models.DailyMetric.trip_count)
        .order_by(models.DailyMetric.metric_date.asc())
        .all()
    )
    return [{"date": r.metric_date.isoformat(), "value": r.trip_count} for r in rows]


def fetch_daily_vehicle_count(db: Session) -> list[dict]:
    rows = (
        db.query(models.DailyMetric.metric_date, models.DailyMetric.vehicle_count)
        .order_by(models.DailyMetric.metric_date.asc())
        .all()
    )
    return [{"date": r.metric_date.isoformat(), "value": r.vehicle_count} for r in rows]


def fetch_daily_distance(db: Session) -> list[dict]:
    rows = (
        db.query(models.DailyMetric.metric_date, models.DailyMetric.distance_km)
        .order_by(models.DailyMetric.metric_date.asc())
        .all()
    )
    return [{"date": r.metric_date.isoformat(), "value": r.distance_km} for r in rows]


def fetch_distance_boxplot(db: Session) -> list[dict]:
    sql = text(
        """
        SELECT
          metric_date AS trip_date,
          q1_value AS q1,
          median_value AS median,
          q3_value AS q3,
          min_value,
          max_value,
          sample_count
        FROM daily_distance_boxplot
        ORDER BY metric_date
        """
    )
    rows = db.execute(sql).mappings().all()
    return [dict(r) for r in rows]


def fetch_speed_boxplot(db: Session) -> list[dict]:
    sql = text(
        """
        SELECT
          metric_date AS trip_date,
          q1_value AS q1,
          median_value AS median,
          q3_value AS q3,
          min_value,
          max_value,
          sample_count
        FROM daily_speed_boxplot
        ORDER BY metric_date
        """
    )
    rows = db.execute(sql).mappings().all()
    return [dict(r) for r in rows]
