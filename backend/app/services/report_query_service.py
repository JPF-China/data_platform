"""Query operations reporting precomputed tables."""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session


def _to_dict(row) -> dict[str, object]:
    return {k: str(v) if hasattr(v, "isoformat") else v for k, v in dict(row).items()}


def fetch_daily_report(db: Session, limit: int = 30) -> list[dict[str, object]]:
    rows = (
        db.execute(
            text(
                "SELECT report_date, total_trips, total_vehicles, total_distance_km, "
                "avg_trip_distance_m, avg_speed_kmh, peak_hour_trip_ratio, night_trip_ratio, "
                "fatigue_count, severe_fatigue_count, peak_vehicles, night_vehicles "
                "FROM report_daily_summary ORDER BY report_date DESC LIMIT :lim"
            ),
            {"lim": limit},
        )
        .mappings()
        .all()
    )
    return [_to_dict(r) for r in rows]


def fetch_weekly_report(db: Session, limit: int = 12) -> list[dict[str, object]]:
    rows = (
        db.execute(
            text(
                "SELECT week_start, week_end, total_trips, total_vehicles, "
                "total_distance_km, avg_daily_trips, avg_trip_distance_m, "
                "fatigue_events, severe_fatigue_events, abnormal_events, night_risk_drivers "
                "FROM report_weekly_summary ORDER BY week_start DESC LIMIT :lim"
            ),
            {"lim": limit},
        )
        .mappings()
        .all()
    )
    return [_to_dict(r) for r in rows]
