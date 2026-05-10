"""Query ops profile precomputed tables."""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session


def fetch_vehicle_profiles(
    db: Session,
    vehicle_id: str | None = None,
    tag_code: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, object]]:
    joins = ""
    where = "WHERE 1=1"
    params: dict[str, object] = {}
    if vehicle_id:
        where += " AND p.vehicle_id = :vid"
        params["vid"] = vehicle_id
    if tag_code:
        joins = " JOIN ops_vehicle_tag t ON t.vehicle_id = p.vehicle_id AND t.tag_code = :tc"
        params["tc"] = tag_code
    sql = text(
        f"SELECT p.* FROM ops_vehicle_profile p{joins} {where} "
        "ORDER BY p.trip_count DESC LIMIT :lim OFFSET :off"
    )
    params["lim"] = limit
    params["off"] = offset
    rows = db.execute(sql, params).mappings().all()
    return [_row_to_dict(r) for r in rows]


def fetch_vehicle_tags(db: Session) -> list[dict[str, object]]:
    rows = (
        db.execute(
            text(
                "SELECT vehicle_id, tag_code, tag_name, tag_score "
                "FROM ops_vehicle_tag ORDER BY vehicle_id, tag_code"
            )
        )
        .mappings()
        .all()
    )
    return [_row_to_dict(r) for r in rows]


def fetch_ops_totals(db: Session) -> dict[str, int]:
    total_v = db.execute(text("SELECT COUNT(*) FROM ops_vehicle_profile")).scalar() or 0
    total_t = db.execute(text("SELECT COUNT(*) FROM ops_vehicle_tag")).scalar() or 0
    return {"total_vehicles": total_v, "total_tags": total_t}


def fetch_frequent_routes(
    db: Session,
    vehicle_id: str | None = None,
    top3_only: bool = False,
    limit: int = 100,
) -> list[dict[str, object]]:
    base = "SELECT vehicle_id, road_id, road_name, usage_count, total_distance_m, is_top3 FROM ops_frequent_route WHERE 1=1"
    params: dict[str, object] = {}
    if vehicle_id:
        base += " AND vehicle_id = :vid"
        params["vid"] = vehicle_id
    if top3_only:
        base += " AND is_top3 = true"
    base += " ORDER BY usage_count DESC LIMIT :lim"
    params["lim"] = limit
    rows = db.execute(text(base), params).mappings().all()
    return [_row_to_dict(r) for r in rows]


def fetch_activity_ranking(
    db: Session,
    category: str = "trip_count",
    limit: int = 50,
) -> list[dict[str, object]]:
    rows = (
        db.execute(
            text(
                "SELECT rank_num, vehicle_id, trip_count, total_distance_m, "
                "active_days, avg_daily_trips, avg_speed_kmh, dominant_hour, rank_category "
                "FROM ops_activity_ranking WHERE rank_category = :cat "
                "ORDER BY rank_num LIMIT :lim"
            ),
            {"cat": category, "lim": limit},
        )
        .mappings()
        .all()
    )
    return [_row_to_dict(r) for r in rows]


def _row_to_dict(row) -> dict[str, object]:
    return {k: str(v) if hasattr(v, "isoformat") else v for k, v in dict(row).items()}
