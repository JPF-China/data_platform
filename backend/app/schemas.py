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
    graph_ready: bool
    dynamic_speed_ready: bool
    route_compare_ready: bool
    pgrouting_available: bool
    road_segments_ready: bool
    edge_count: int
    stats_initialized: bool
    speed_bins_ready: bool
    speed_bins_count: int
    issues: list[str]


class MetaAssetItem(BaseModel):
    asset_key: str
    display_name: str
    asset_layer: str
    asset_type: str
    source_table: str
    status: str
    row_count: int
    refreshed_at: str | None = None
    description: str | None = None


class MetaJobItem(BaseModel):
    job_name: str
    latest_run_id: int | None = None
    status: str
    started_at: str | None = None
    finished_at: str | None = None
    message: str | None = None
    details: dict[str, object] = Field(default_factory=dict)


class MetaDatesResponse(BaseModel):
    summary_dates: list[str]
    heatmap_dates: list[str]
    route_dates: list[str]
    default_summary_date: str | None = None
    default_heatmap_date: str | None = None
    default_route_date: str | None = None
    refreshed_at: str | None = None


class MetaAssetsResponse(BaseModel):
    items: list[MetaAssetItem]


class MetaPortalLayerItem(BaseModel):
    asset_layer: str
    asset_count: int
    ready_count: int
    total_rows: int
    completion_rate: float
    refreshed_at: str | None = None


class MetaPortalSummaryResponse(BaseModel):
    total_asset_count: int
    total_ready_count: int
    total_rows: int
    refreshed_at: str | None = None
    items: list[MetaPortalLayerItem]


class MetaJobResponse(BaseModel):
    item: MetaJobItem | None = None


class MetaCapabilityResponse(BaseModel):
    route: RouteCapabilityResponse
    latest_job: MetaJobItem | None = None
    summary_dates: list[str]
    heatmap_dates: list[str]
    route_dates: list[str]
    default_summary_date: str | None = None
    default_heatmap_date: str | None = None
    default_route_date: str | None = None
    refreshed_at: str | None = None


class CrowdTagSummaryItem(BaseModel):
    tag_code: str
    tag_name: str
    vehicle_count: int
    avg_trip_count: float | None = None
    avg_trip_distance_m: float | None = None
    avg_speed_kmh: float | None = None
    updated_at: str | None = None


class CrowdVehicleItem(BaseModel):
    vehicle_id: str
    active_days: int
    trip_count: int
    total_distance_m: float
    avg_trip_distance_m: float | None = None
    avg_speed_kmh: float | None = None
    dominant_start_hour: int | None = None
    tags: list[str] = Field(default_factory=list)


class CrowdSegmentItem(BaseModel):
    tag_code: str
    tag_name: str | None = None
    road_id: str | None = None
    road_name: str | None = None
    trip_count: int
    vehicle_count: int
    distance_m: float
    avg_speed_kmh: float | None = None
    geometry: str | None = None
    updated_at: str | None = None


class CrowdProfileSummaryResponse(BaseModel):
    total_vehicle_count: int
    tagged_vehicle_count: int
    tag_count: int
    updated_at: str | None = None
    items: list[CrowdTagSummaryItem]


class CrowdVehiclesResponse(BaseModel):
    items: list[CrowdVehicleItem]


class CrowdSegmentsResponse(BaseModel):
    items: list[CrowdSegmentItem]


class DepartureWindowRequest(BaseModel):
    travel_date: date
    start_point: PointInput
    end_point: PointInput
    window_start_hour: int = Field(default=7, ge=0, le=23)
    window_end_hour: int = Field(default=10, ge=0, le=23)
    step_minutes: int = Field(default=15, ge=5, le=60)


class DepartureWindowOption(BaseModel):
    start_time: str
    query_bucket_start: str
    recommended_strategy: str
    estimated_time_s: float
    used_dynamic_speed: bool
    score: float
    summary: str


class RouteRecommendationResponse(BaseModel):
    start_time: str
    query_time: str
    query_bucket_start: str
    recommended_strategy: str
    used_dynamic_speed: bool
    fallback_mode: str
    summary: str
    reasons: list[str]
    time_saved_s: float
    distance_delta_m: float
    recommended_route: RoutePlan
    alternative_route: RoutePlan
    shortest_route: RoutePlan
    fastest_route: RoutePlan


class DepartureWindowResponse(BaseModel):
    travel_date: str
    recommended_start_time: str
    recommended_query_bucket_start: str
    summary: str
    options: list[DepartureWindowOption]


class CongestionAvoidanceResponse(BaseModel):
    current_query_time: str
    current_bucket_start: str
    current_network_level: str | None = None
    recommended_action: str
    recommended_query_time: str
    recommended_strategy: str
    summary: str
    reasons: list[str]


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
