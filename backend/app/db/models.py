from datetime import datetime

from sqlalchemy import (
    BIGINT,
    TIMESTAMP,
    Boolean,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .session import Base


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    trip_uid: Mapped[str] = mapped_column(String, unique=True, index=True)
    source_trip_key: Mapped[str | None] = mapped_column(String)
    devid: Mapped[str | None] = mapped_column(String, index=True)
    trip_date: Mapped[datetime | None] = mapped_column(Date, index=True)
    start_time: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=False))
    end_time: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=False))
    point_count: Mapped[int] = mapped_column(Integer, default=0)
    valid_point_count: Mapped[int] = mapped_column(Integer, default=0)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    source_file: Mapped[str | None] = mapped_column(String)


class DailyMetric(Base):
    __tablename__ = "daily_metrics"

    metric_date: Mapped[datetime] = mapped_column(Date, primary_key=True)
    trip_count: Mapped[int] = mapped_column(Integer)
    vehicle_count: Mapped[int] = mapped_column(Integer)
    distance_m: Mapped[float] = mapped_column(Float)
    distance_km: Mapped[float] = mapped_column(Float)
    avg_trip_distance_m: Mapped[float | None] = mapped_column(Float)
    median_trip_distance_m: Mapped[float | None] = mapped_column(Float)
    avg_speed_kmh: Mapped[float | None] = mapped_column(Float)


class HeatmapBin(Base):
    __tablename__ = "heatmap_bins"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    metric_date: Mapped[datetime] = mapped_column(Date, index=True)
    road_id: Mapped[str | None] = mapped_column(String, index=True)
    road_name: Mapped[str | None] = mapped_column(String)
    trip_count: Mapped[int] = mapped_column(Integer)
    vehicle_count: Mapped[int] = mapped_column(Integer)
    flow_count: Mapped[int] = mapped_column(Integer)
    distance_m: Mapped[float] = mapped_column(Float)


class RouteResult(Base):
    __tablename__ = "route_results"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    query_time: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=False))
    route_type: Mapped[str] = mapped_column(String, index=True)
    distance_m: Mapped[float] = mapped_column(Float)
    estimated_time_s: Mapped[float] = mapped_column(Float)
    path_json: Mapped[dict | None] = mapped_column(JSONB)
    meta: Mapped[dict | None] = mapped_column(JSONB)


class TripSegment(Base):
    __tablename__ = "trip_segments"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    trip_id: Mapped[int] = mapped_column(
        BIGINT, ForeignKey("trips.id", ondelete="CASCADE"), index=True
    )
    segment_seq: Mapped[int] = mapped_column(Integer)
    from_point_seq: Mapped[int] = mapped_column(Integer)
    to_point_seq: Mapped[int] = mapped_column(Integer)
    start_time: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=False))
    end_time: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=False))
    distance_m: Mapped[float] = mapped_column(Float)
    duration_s: Mapped[float | None] = mapped_column(Float)
    avg_speed_kmh: Mapped[float | None] = mapped_column(Float)
    road_id: Mapped[str | None] = mapped_column(String)
    road_name: Mapped[str | None] = mapped_column(String)


class TripMatchMeta(Base):
    __tablename__ = "trip_match_meta"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    trip_id: Mapped[int] = mapped_column(
        BIGINT, ForeignKey("trips.id", ondelete="CASCADE"), index=True
    )
    point_seq: Mapped[int] = mapped_column(Integer)
    matched_seq: Mapped[int | None] = mapped_column(Integer)
    road_id: Mapped[str | None] = mapped_column(String, index=True)
    road_name: Mapped[str | None] = mapped_column(String)
    direction: Mapped[str | None] = mapped_column(String)
    is_virtual: Mapped[bool] = mapped_column(Boolean, default=False)
    confidence: Mapped[float | None] = mapped_column(Float)
    segment_fraction: Mapped[float | None] = mapped_column(Float)
    raw_payload: Mapped[dict | None] = mapped_column(JSONB)


class TripPointRaw(Base):
    __tablename__ = "trip_points_raw"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    trip_id: Mapped[int] = mapped_column(
        BIGINT, ForeignKey("trips.id", ondelete="CASCADE"), index=True
    )
    point_seq: Mapped[int] = mapped_column(Integer)
    event_time: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=False))
    tms: Mapped[int | None] = mapped_column(BIGINT)
    devid: Mapped[str | None] = mapped_column(String)
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    speed: Mapped[float | None] = mapped_column(Float)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    invalid_reason: Mapped[str | None] = mapped_column(Text)
