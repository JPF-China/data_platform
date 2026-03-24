from datetime import date, datetime

from pydantic import BaseModel, Field


class PointInput(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


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
