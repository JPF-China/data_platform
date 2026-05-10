"""Query risk monitoring precomputed tables."""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session


def _to_dict(row) -> dict[str, object]:
    return {k: str(v) if hasattr(v, "isoformat") else v for k, v in dict(row).items()}


def fetch_fatigue(
    db: Session,
    level: str | None = None,
    limit: int = 100,
) -> list[dict[str, object]]:
    base = (
        "SELECT driver_id, window_start, window_end, run_minutes, "
        "fatigue_level, threshold_minutes, severe_threshold_minutes "
        "FROM risk_driver_fatigue WHERE 1=1"
    )
    params: dict[str, object] = {}
    if level:
        base += " AND fatigue_level = :lvl"
        params["lvl"] = level
    base += " ORDER BY window_start DESC LIMIT :lim"
    params["lim"] = limit
    rows = db.execute(text(base), params).mappings().all()
    return [_to_dict(r) for r in rows]


def fetch_fatigue_events(
    db: Session,
    limit: int = 100,
) -> list[dict[str, object]]:
    rows = (
        db.execute(
            text(
                "SELECT id, driver_id, event_time, fatigue_level, run_minutes "
                "FROM risk_driver_fatigue_event ORDER BY event_time DESC LIMIT :lim"
            ),
            {"lim": limit},
        )
        .mappings()
        .all()
    )
    return [_to_dict(r) for r in rows]


def fetch_abnormal_running(
    db: Session,
    risk_level: str | None = None,
    limit: int = 100,
) -> list[dict[str, object]]:
    base = (
        "SELECT driver_id, event_date, single_trip_duration_min, "
        "single_trip_distance_m, risk_level "
        "FROM risk_abnormal_running WHERE 1=1"
    )
    params: dict[str, object] = {}
    if risk_level:
        base += " AND risk_level = :rl"
        params["rl"] = risk_level
    base += " ORDER BY event_date DESC LIMIT :lim"
    params["lim"] = limit
    rows = db.execute(text(base), params).mappings().all()
    return [_to_dict(r) for r in rows]


def fetch_night_risk(
    db: Session,
    risk_level: str | None = None,
    limit: int = 100,
) -> list[dict[str, object]]:
    base = (
        "SELECT driver_id, event_date, night_distance_m, night_duration_min, "
        "night_speed_kmh, risk_level "
        "FROM risk_night_high_risk WHERE 1=1"
    )
    params: dict[str, object] = {}
    if risk_level:
        base += " AND risk_level = :rl"
        params["rl"] = risk_level
    base += " ORDER BY event_date DESC LIMIT :lim"
    params["lim"] = limit
    rows = db.execute(text(base), params).mappings().all()
    return [_to_dict(r) for r in rows]


def fetch_risk_summary(db: Session) -> list[dict[str, object]]:
    rows = (
        db.execute(
            text(
                "SELECT summary_date, total_drivers, fatigue_drivers, "
                "severe_fatigue_drivers, abnormal_running_events, "
                "night_risk_drivers, overall_risk_level "
                "FROM risk_summary ORDER BY summary_date DESC"
            )
        )
        .mappings()
        .all()
    )
    return [_to_dict(r) for r in rows]
