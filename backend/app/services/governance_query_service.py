"""Query data governance precomputed tables."""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session


def _to_dict(row) -> dict[str, object]:
    return {k: str(v) if hasattr(v, "isoformat") else v for k, v in dict(row).items()}


def fetch_asset_catalog(db: Session) -> list[dict[str, object]]:
    rows = (
        db.execute(
            text(
                "SELECT asset_key, display_name, asset_layer, asset_type, "
                "status, row_count, refreshed_at "
                "FROM meta_asset_catalog ORDER BY asset_layer, asset_key"
            )
        )
        .mappings()
        .all()
    )
    return [_to_dict(r) for r in rows]


def fetch_portal_summary(db: Session) -> list[dict[str, object]]:
    rows = (
        db.execute(
            text(
                "SELECT asset_layer, asset_count, ready_count, total_rows "
                "FROM ads_asset_portal_summary ORDER BY asset_layer"
            )
        )
        .mappings()
        .all()
    )
    return [_to_dict(r) for r in rows]


def fetch_quality_checks(db: Session) -> list[dict[str, object]]:
    rows = (
        db.execute(
            text(
                "SELECT check_key, status, checked_at, details "
                "FROM meta_data_quality_check ORDER BY check_key"
            )
        )
        .mappings()
        .all()
    )
    return [_to_dict(r) for r in rows]


def fetch_available_time_range(db: Session) -> dict[str, object]:
    row = (
        db.execute(
            text(
                "SELECT min_date, max_date, available_dates "
                "FROM meta_available_time_range WHERE asset_key = 'trips'"
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return {"min_date": None, "max_date": None, "available_dates": []}
    return _to_dict(row)
