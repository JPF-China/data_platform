from sqlalchemy.orm import Session

from app.schemas import RouteCompareRequest, RouteCompareResponse, SnappedPoint
from app.services.route_payload_service import build_route_payload
from app.services.route_persistence_service import persist_route
from app.services.route_search_service import (
    ensure_routing_ready,
    has_speed_bins_for_bucket,
    nearest_graph_node_with_snap,
    run_pgr_dijkstra,
    snap_to_bucket,
    to_naive_datetime,
)


def compare_routes(db: Session, payload: RouteCompareRequest) -> RouteCompareResponse:
    ensure_routing_ready(db)

    payload = RouteCompareRequest(
        start_time=to_naive_datetime(payload.start_time),
        query_time=to_naive_datetime(payload.query_time),
        start_point=payload.start_point,
        end_point=payload.end_point,
    )

    snapped_start = nearest_graph_node_with_snap(
        db, payload.start_point.lat, payload.start_point.lon
    )
    snapped_end = nearest_graph_node_with_snap(
        db, payload.end_point.lat, payload.end_point.lon
    )
    start_node = int(snapped_start["node_id"])
    end_node = int(snapped_end["node_id"])

    bucket_start = snap_to_bucket(payload.query_time)

    shortest_rows = run_pgr_dijkstra(db, start_node, end_node, weight="distance_m")
    shortest_route = build_route_payload(db, shortest_rows, "distance_m")

    use_speed_bins = has_speed_bins_for_bucket(db, bucket_start)
    if use_speed_bins:
        fastest_route = build_route_payload(
            db,
            run_pgr_dijkstra(
                db,
                start_node,
                end_node,
                weight="travel_time_s",
                bucket_start=bucket_start,
            ),
            "travel_time_s",
            bucket_start=bucket_start,
            use_step_cost_for_time=True,
        )
    else:
        fastest_route = build_route_payload(
            db,
            shortest_rows,
            "travel_time_s",
            bucket_start=bucket_start,
            use_step_cost_for_time=False,
        )

    persist_route(db, payload, "shortest", shortest_route)
    persist_route(db, payload, "fastest", fastest_route)
    db.commit()

    return RouteCompareResponse(
        start_time=payload.start_time.isoformat(),
        query_time=payload.query_time.isoformat(),
        query_bucket_start=bucket_start.isoformat(),
        nearest_start_node=start_node,
        nearest_end_node=end_node,
        route_start_node=start_node,
        route_end_node=end_node,
        snapped_start_point=SnappedPoint(
            lat=float(snapped_start["lat"]),
            lon=float(snapped_start["lon"]),
            node_id=start_node,
            snap_distance_m=float(snapped_start["snap_distance_m"]),
        ),
        snapped_end_point=SnappedPoint(
            lat=float(snapped_end["lat"]),
            lon=float(snapped_end["lon"]),
            node_id=end_node,
            snap_distance_m=float(snapped_end["snap_distance_m"]),
        ),
        shortest_route=shortest_route,
        fastest_route=fastest_route,
    )
