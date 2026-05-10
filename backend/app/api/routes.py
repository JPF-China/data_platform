from datetime import date, datetime
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas import (
    BoxplotResponse,
    BucketsResponse,
    CongestionAvoidanceResponse,
    CrowdSegmentGeometryResponse,
    CrowdProfileSummaryResponse,
    CrowdSegmentsResponse,
    CrowdVehiclesResponse,
    DateValueResponse,
    DepartureWindowRequest,
    DepartureWindowResponse,
    HeatmapResponse,
    MetaAssetsResponse,
    MetaCapabilityResponse,
    MetaDatesResponse,
    MetaJobResponse,
    MetaPortalSummaryResponse,
    PointInput,
    RouteRecommendationResponse,
    RouteCapabilityResponse,
    RouteCompareRequest,
    RouteCompareResponse,
    SummaryResponse,
)
from app.services.crowd_service import (
    fetch_crowd_segment_geometry,
    fetch_crowd_profile_summary,
    fetch_crowd_segments,
    fetch_crowd_vehicles,
)
from app.services.metadata_service import (
    fetch_asset_catalog,
    fetch_asset_portal_summary,
    fetch_available_dates,
    fetch_latest_job_status,
    fetch_metadata_capability,
)
from app.services.query_service import (
    fetch_daily_distance,
    fetch_daily_summary,
    fetch_daily_trip_count,
    fetch_daily_vehicle_count,
    fetch_distance_boxplot,
    fetch_heatmap,
    fetch_heatmap_buckets,
    fetch_speed_boxplot,
)
from app.services.route_capability_service import get_route_capability
from app.services.recommendation_service import (
    recommend_congestion_avoidance,
    recommend_departure_window,
    recommend_route,
)
from app.services.route_service import compare_routes

router = APIRouter()

SUMMARY_EXAMPLE = {
    "items": [
        {
            "date": "2015-01-03",
            "trip_count": 1,
            "vehicle_count": 1,
            "distance_km": 7.0,
            "avg_speed_kmh": 42.0,
        }
    ]
}

ROUTE_COMPARE_REQUEST_EXAMPLE = {
    "start_time": "2026-03-20T08:00:00",
    "query_time": "2026-03-20T08:00:00",
    "start_point": {"lat": 45.756, "lon": 126.642},
    "end_point": {"lat": 45.721, "lon": 126.588},
}

ROUTE_COMPARE_RESPONSE_EXAMPLE = {
    "start_time": "2026-03-20T08:00:00",
    "query_time": "2026-03-20T08:00:00",
    "query_bucket_start": "2026-03-20T08:00:00",
    "nearest_start_node": 1001,
    "nearest_end_node": 1003,
    "route_start_node": 1001,
    "route_end_node": 1003,
    "snapped_start_point": {
        "lat": 45.756,
        "lon": 126.642,
        "node_id": 1001,
        "snap_distance_m": 12.6,
    },
    "snapped_end_point": {
        "lat": 45.721,
        "lon": 126.588,
        "node_id": 1003,
        "snap_distance_m": 8.2,
    },
    "shortest_route": {
        "weight": "distance_m",
        "distance_m": 7000.0,
        "estimated_time_s": 600.0,
        "edges": [
            {
                "seq": 0,
                "edge_id": 201,
                "road_id": "1",
                "from_node": 1001,
                "to_node": 1002,
                "distance_m": 3000.0,
                "estimated_time_s": 300.0,
                "cumulative_distance_m": 3000.0,
                "cumulative_time_s": 300.0,
                "path_wkt": "LINESTRING(126.642 45.756,126.62 45.74)",
            }
        ],
        "path_wkt_segments": ["LINESTRING(126.642 45.756,126.62 45.74)"],
        "query_bucket_start": None,
    },
    "fastest_route": {
        "weight": "travel_time_s",
        "distance_m": 7000.0,
        "estimated_time_s": 540.0,
        "edges": [
            {
                "seq": 0,
                "edge_id": 201,
                "road_id": "1",
                "from_node": 1001,
                "to_node": 1002,
                "distance_m": 3000.0,
                "estimated_time_s": 240.0,
                "cumulative_distance_m": 3000.0,
                "cumulative_time_s": 240.0,
                "path_wkt": "LINESTRING(126.642 45.756,126.62 45.74)",
            }
        ],
        "path_wkt_segments": ["LINESTRING(126.642 45.756,126.62 45.74)"],
        "query_bucket_start": "2026-03-20T08:00:00",
    },
}


@router.get("/meta/assets", response_model=MetaAssetsResponse)
def meta_assets(db: Session = Depends(get_db)) -> MetaAssetsResponse:
    return MetaAssetsResponse.model_validate({"items": fetch_asset_catalog(db)})


@router.get("/meta/portal-summary", response_model=MetaPortalSummaryResponse)
def meta_portal_summary(db: Session = Depends(get_db)) -> MetaPortalSummaryResponse:
    return MetaPortalSummaryResponse.model_validate(fetch_asset_portal_summary(db))


@router.get("/meta/dates", response_model=MetaDatesResponse)
def meta_dates(db: Session = Depends(get_db)) -> MetaDatesResponse:
    return MetaDatesResponse.model_validate(fetch_available_dates(db))


@router.get("/meta/jobs/latest", response_model=MetaJobResponse)
def meta_latest_job(db: Session = Depends(get_db)) -> MetaJobResponse:
    return MetaJobResponse.model_validate({"item": fetch_latest_job_status(db)})


@router.get("/meta/heatmap-buckets", response_model=BucketsResponse)
def meta_heatmap_buckets(
    metric_date: date = Query(...),
    db: Session = Depends(get_db),
) -> BucketsResponse:
    return BucketsResponse.model_validate(
        {"items": fetch_heatmap_buckets(db, metric_date)}
    )


@router.get("/meta/capability", response_model=MetaCapabilityResponse)
def meta_capability(db: Session = Depends(get_db)) -> MetaCapabilityResponse:
    return MetaCapabilityResponse.model_validate(fetch_metadata_capability(db))


@router.get("/crowd/profile-summary", response_model=CrowdProfileSummaryResponse)
def crowd_profile_summary(
    db: Session = Depends(get_db),
) -> CrowdProfileSummaryResponse:
    return CrowdProfileSummaryResponse.model_validate(fetch_crowd_profile_summary(db))


@router.get("/crowd/vehicles", response_model=CrowdVehiclesResponse)
def crowd_vehicles(
    tag_code: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> CrowdVehiclesResponse:
    return CrowdVehiclesResponse.model_validate(
        {"items": fetch_crowd_vehicles(db, tag_code=tag_code, limit=limit)}
    )


@router.get("/crowd/segments", response_model=CrowdSegmentsResponse)
def crowd_segments(
    tag_code: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=100),
    include_geometry: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> CrowdSegmentsResponse:
    return CrowdSegmentsResponse.model_validate(
        {
            "items": fetch_crowd_segments(
                db,
                tag_code=tag_code,
                limit=limit,
                include_geometry=include_geometry,
            )
        }
    )


@router.get(
    "/crowd/segments/{road_id}/geometry",
    response_model=CrowdSegmentGeometryResponse,
)
def crowd_segment_geometry(
    road_id: str,
    db: Session = Depends(get_db),
) -> CrowdSegmentGeometryResponse:
    item = fetch_crowd_segment_geometry(db, road_id=road_id)
    if item is None:
        raise HTTPException(status_code=404, detail="road geometry not found")
    return CrowdSegmentGeometryResponse.model_validate(item)


@router.post("/recommend/route", response_model=RouteRecommendationResponse)
def route_recommendation(
    payload: RouteCompareRequest, db: Session = Depends(get_db)
) -> RouteRecommendationResponse:
    return RouteRecommendationResponse.model_validate(recommend_route(db, payload))


@router.get("/recommend/departure-window", response_model=DepartureWindowResponse)
def departure_window_recommendation(
    travel_date: date = Query(...),
    start_lat: float = Query(..., ge=-90, le=90),
    start_lon: float = Query(..., ge=-180, le=180),
    end_lat: float = Query(..., ge=-90, le=90),
    end_lon: float = Query(..., ge=-180, le=180),
    window_start_hour: int = Query(default=7, ge=0, le=23),
    window_end_hour: int = Query(default=10, ge=0, le=23),
    step_minutes: int = Query(default=15, ge=5, le=60),
    db: Session = Depends(get_db),
) -> DepartureWindowResponse:
    payload = DepartureWindowRequest(
        travel_date=travel_date,
        start_point=PointInput(lat=start_lat, lon=start_lon),
        end_point=PointInput(lat=end_lat, lon=end_lon),
        window_start_hour=window_start_hour,
        window_end_hour=window_end_hour,
        step_minutes=step_minutes,
    )
    return DepartureWindowResponse.model_validate(
        recommend_departure_window(db, payload)
    )


@router.get(
    "/recommend/congestion-avoidance",
    response_model=CongestionAvoidanceResponse,
)
def congestion_avoidance_recommendation(
    start_time: datetime = Query(...),
    query_time: datetime = Query(...),
    start_lat: float = Query(..., ge=-90, le=90),
    start_lon: float = Query(..., ge=-180, le=180),
    end_lat: float = Query(..., ge=-90, le=90),
    end_lon: float = Query(..., ge=-180, le=180),
    db: Session = Depends(get_db),
) -> CongestionAvoidanceResponse:
    payload = RouteCompareRequest(
        start_time=start_time,
        query_time=query_time,
        start_point=PointInput(lat=start_lat, lon=start_lon),
        end_point=PointInput(lat=end_lat, lon=end_lon),
    )
    return CongestionAvoidanceResponse.model_validate(
        recommend_congestion_avoidance(db, payload)
    )


@router.get(
    "/summary/daily",
    response_model=SummaryResponse,
    responses={200: {"content": {"application/json": {"example": SUMMARY_EXAMPLE}}}},
)
def daily_summary(db: Session = Depends(get_db)) -> SummaryResponse:
    return SummaryResponse.model_validate({"items": fetch_daily_summary(db)})


@router.get("/map/heatmap", response_model=HeatmapResponse)
def heatmap(
    metric_date: date = Query(...),
    bucket_start: datetime = Query(...),
    min_lat: float | None = Query(default=None),
    min_lon: float | None = Query(default=None),
    max_lat: float | None = Query(default=None),
    max_lon: float | None = Query(default=None),
    db: Session = Depends(get_db),
) -> HeatmapResponse:
    bbox_values = [min_lat, min_lon, max_lat, max_lon]
    has_any_bbox = any(value is not None for value in bbox_values)
    has_full_bbox = all(value is not None for value in bbox_values)
    if has_any_bbox and not has_full_bbox:
        raise HTTPException(
            status_code=400,
            detail="bbox filter requires all of min_lat/min_lon/max_lat/max_lon",
        )
    if has_full_bbox:
        min_lat_v = cast(float, min_lat)
        min_lon_v = cast(float, min_lon)
        max_lat_v = cast(float, max_lat)
        max_lon_v = cast(float, max_lon)
        if min_lat_v > max_lat_v or min_lon_v > max_lon_v:
            raise HTTPException(
                status_code=400,
                detail="bbox bounds must satisfy min_lat <= max_lat and min_lon <= max_lon",
            )

    return HeatmapResponse.model_validate(
        {
            "items": fetch_heatmap(
                db,
                metric_date,
                bucket_start,
                min_lat=min_lat,
                min_lon=min_lon,
                max_lat=max_lat,
                max_lon=max_lon,
            )
        }
    )


@router.get("/map/heatmap/buckets", response_model=BucketsResponse)
def heatmap_buckets(
    metric_date: date = Query(...),
    db: Session = Depends(get_db),
) -> BucketsResponse:
    return BucketsResponse.model_validate(
        {"items": fetch_heatmap_buckets(db, metric_date)}
    )


@router.get("/chart/daily-trip-count", response_model=DateValueResponse)
def daily_trip_count(
    db: Session = Depends(get_db),
) -> DateValueResponse:
    return DateValueResponse.model_validate({"items": fetch_daily_trip_count(db)})


@router.get("/chart/daily-vehicle-count", response_model=DateValueResponse)
def daily_vehicle_count(
    db: Session = Depends(get_db),
) -> DateValueResponse:
    return DateValueResponse.model_validate({"items": fetch_daily_vehicle_count(db)})


@router.get("/chart/daily-distance", response_model=DateValueResponse)
def daily_distance(db: Session = Depends(get_db)) -> DateValueResponse:
    return DateValueResponse.model_validate({"items": fetch_daily_distance(db)})


@router.get("/chart/daily-distance-boxplot", response_model=BoxplotResponse)
def daily_distance_boxplot(
    db: Session = Depends(get_db),
) -> BoxplotResponse:
    return BoxplotResponse.model_validate({"items": fetch_distance_boxplot(db)})


@router.get("/chart/daily-speed-boxplot", response_model=BoxplotResponse)
def daily_speed_boxplot(
    db: Session = Depends(get_db),
) -> BoxplotResponse:
    return BoxplotResponse.model_validate({"items": fetch_speed_boxplot(db)})


@router.post(
    "/route/compare",
    response_model=RouteCompareResponse,
    openapi_extra={
        "requestBody": {
            "content": {"application/json": {"example": ROUTE_COMPARE_REQUEST_EXAMPLE}}
        }
    },
    responses={
        200: {
            "content": {"application/json": {"example": ROUTE_COMPARE_RESPONSE_EXAMPLE}}
        }
    },
)
def route_compare(
    payload: RouteCompareRequest, db: Session = Depends(get_db)
) -> RouteCompareResponse:
    try:
        return compare_routes(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/route/capability", response_model=RouteCapabilityResponse)
def route_capability(db: Session = Depends(get_db)) -> RouteCapabilityResponse:
    return RouteCapabilityResponse.model_validate(get_route_capability(db))
