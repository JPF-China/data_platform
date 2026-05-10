from datetime import date, datetime

from pydantic import BaseModel, Field


class PointInput(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class SnappedPoint(BaseModel):
    lat: float
    lon: float
    node_id: int
    snap_distance_m: float


class RouteCompareRequest(BaseModel):
    start_time: datetime
    query_time: datetime = Field(
        ..., description="查询时刻，用于命中5分钟速度桶计算最快路"
    )
    start_point: PointInput
    end_point: PointInput


class DailySummaryItem(BaseModel):
    date: str
    trip_count: int
    vehicle_count: int
    distance_km: float
    avg_speed_kmh: float | None = None


class DateValueItem(BaseModel):
    date: str
    value: float


class BoxplotItem(BaseModel):
    trip_date: date
    q1: float
    median: float
    q3: float
    min_value: float
    max_value: float
    sample_count: int


class HeatmapItem(BaseModel):
    road_id: str | None = None
    road_name: str | None = None
    trip_count: int
    vehicle_count: int
    flow_count: int
    distance_m: float
    time_bucket_start: str
    time_bucket_end: str
    geometry: str


class EdgeItem(BaseModel):
    seq: int
    edge_id: int
    road_id: str | None = None
    from_node: int
    to_node: int
    distance_m: float
    estimated_time_s: float
    cumulative_distance_m: float
    cumulative_time_s: float
    path_wkt: str | None = None


class RoutePlan(BaseModel):
    weight: str
    distance_m: float
    estimated_time_s: float
    edges: list[EdgeItem]
    path_wkt_segments: list[str]
    query_bucket_start: str | None = None


class RouteCapabilityResponse(BaseModel):
    ready: bool
    pgrouting_available: bool
    road_segments_ready: bool
    edge_count: int
    stats_initialized: bool
    speed_bins_ready: bool
    speed_bins_count: int
    issues: list[str]


class RouteCompareResponse(BaseModel):
    start_time: str
    query_time: str
    query_bucket_start: str
    nearest_start_node: int
    nearest_end_node: int
    route_start_node: int
    route_end_node: int
    snapped_start_point: SnappedPoint
    snapped_end_point: SnappedPoint
    shortest_route: RoutePlan
    fastest_route: RoutePlan


class ItemsResponse(BaseModel):
    items: list[dict[str, object]]


class SummaryResponse(BaseModel):
    items: list[DailySummaryItem]


class DateValueResponse(BaseModel):
    items: list[DateValueItem]


class BoxplotResponse(BaseModel):
    items: list[BoxplotItem]


class HeatmapResponse(BaseModel):
    items: list[HeatmapItem]


class BucketsResponse(BaseModel):
    items: list[str]


# ── ops profile ──

class VehicleProfileItem(BaseModel):
    vehicle_id: str
    first_trip_date: str | None = None
    last_trip_date: str | None = None
    active_days: int
    trip_count: int
    total_distance_m: float
    avg_trip_distance_m: float | None = None
    avg_speed_kmh: float | None = None
    morning_trip_count: int
    night_trip_count: int
    peak_trip_count: int
    short_trip_count: int
    long_trip_count: int
    dominant_start_hour: int | None = None


class VehicleTagItem(BaseModel):
    vehicle_id: str
    tag_code: str
    tag_name: str
    tag_score: float | None = None


class FrequentRouteItem(BaseModel):
    vehicle_id: str
    road_id: str
    road_name: str | None = None
    usage_count: int
    total_distance_m: float
    is_top3: bool


class ActivityRankingItem(BaseModel):
    rank_num: int
    vehicle_id: str
    trip_count: int
    total_distance_m: float
    active_days: int
    avg_daily_trips: float | None = None
    avg_speed_kmh: float | None = None
    dominant_hour: int | None = None
    rank_category: str


class OpsProfilesResponse(BaseModel):
    items: list[VehicleProfileItem]
    tags: list[VehicleTagItem]
    total_vehicles: int = 0
    total_tags: int = 0


class FrequentRoutesResponse(BaseModel):
    items: list[FrequentRouteItem]


class ActivityRankingResponse(BaseModel):
    items: list[ActivityRankingItem]


# ── risk monitoring ──

class FatigueItem(BaseModel):
    driver_id: str
    window_start: str
    window_end: str
    run_minutes: int
    fatigue_level: str
    threshold_minutes: int
    severe_threshold_minutes: int


class AbnormalRunningItem(BaseModel):
    driver_id: str
    event_date: str
    single_trip_duration_min: int
    single_trip_distance_m: float
    risk_level: str


class NightRiskItem(BaseModel):
    driver_id: str
    event_date: str
    night_distance_m: float
    night_duration_min: int
    night_speed_kmh: float | None = None
    risk_level: str


class RiskSummaryItem(BaseModel):
    summary_date: str
    total_drivers: int
    fatigue_drivers: int
    severe_fatigue_drivers: int
    abnormal_running_events: int
    night_risk_drivers: int
    overall_risk_level: str | None = None


class FatigueResponse(BaseModel):
    items: list[FatigueItem]
    events: list[dict[str, object]]


class AbnormalRunningResponse(BaseModel):
    items: list[AbnormalRunningItem]


class RiskSummaryResponse(BaseModel):
    items: list[RiskSummaryItem]
    night_risk: list[NightRiskItem]


# ── reporting ──

class DailyReportItem(BaseModel):
    report_date: str
    total_trips: int
    total_vehicles: int
    total_distance_km: float
    avg_trip_distance_m: float | None = None
    avg_speed_kmh: float | None = None
    peak_hour_trip_ratio: float | None = None
    night_trip_ratio: float | None = None
    fatigue_count: int
    severe_fatigue_count: int
    peak_vehicles: int
    night_vehicles: int


class WeeklyReportItem(BaseModel):
    week_start: str
    week_end: str
    total_trips: int
    total_vehicles: int
    total_distance_km: float
    avg_daily_trips: float | None = None
    avg_trip_distance_m: float | None = None
    fatigue_events: int
    severe_fatigue_events: int
    abnormal_events: int


class DailyReportResponse(BaseModel):
    items: list[DailyReportItem]


class WeeklyReportResponse(BaseModel):
    items: list[WeeklyReportItem]


# ── governance ──

class AssetCatalogItem(BaseModel):
    asset_key: str
    display_name: str
    asset_layer: str
    asset_type: str
    status: str
    row_count: int
    refreshed_at: str | None = None


class QualityCheckItem(BaseModel):
    check_key: str
    status: str
    checked_at: str | None = None
    details: dict[str, object]


class AssetPortalItem(BaseModel):
    asset_layer: str
    asset_count: int
    ready_count: int
    total_rows: int


class AssetCatalogResponse(BaseModel):
    items: list[AssetCatalogItem]
    portal: list[AssetPortalItem]


class QualityCheckResponse(BaseModel):
    items: list[QualityCheckItem]
