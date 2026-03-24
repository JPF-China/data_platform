from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas import EdgeItem, RoutePlan


def build_route_payload(
    db: Session,
    dijkstra_rows: list[dict],
    weight: str,
    bucket_start=None,
    use_step_cost_for_time: bool = False,
) -> RoutePlan:
    traversed = [r for r in dijkstra_rows if int(r["edge"]) != -1]
    if not traversed:
        raise ValueError("No traversable path found between selected points")

    edge_ids = [int(r["edge"]) for r in traversed]
    edge_rows = (
        db.execute(
            text(
                """
            SELECT
              id,
              road_id,
              COALESCE(length_m, ST_Length(geom::geography)) AS distance_m,
              COALESCE(travel_time_s, COALESCE(length_m, ST_Length(geom::geography)) / 8.33) AS duration_s,
              ST_AsText(geom) AS path_wkt
            FROM road_segments
            WHERE id = ANY(:edge_ids)
            """
            ),
            {"edge_ids": edge_ids},
        )
        .mappings()
        .all()
    )
    edge_map = {int(r["id"]): r for r in edge_rows}

    edge_items: list[EdgeItem] = []
    total_d = 0.0
    total_t = 0.0
    wkt_segments: list[str] = []

    for i, step in enumerate(traversed):
        edge_id = int(step["edge"])
        edge = edge_map.get(edge_id)
        if edge is None:
            raise ValueError(f"missing edge details for road_segments.id={edge_id}")

        from_node = int(step["node"])
        to_node = int(dijkstra_rows[i + 1]["node"])
        distance_m = float(edge["distance_m"])
        duration_s = (
            float(step["cost"]) if use_step_cost_for_time else float(edge["duration_s"])
        )
        total_d += distance_m
        total_t += duration_s
        edge_items.append(
            EdgeItem(
                seq=i,
                edge_id=edge_id,
                road_id=edge.get("road_id"),
                from_node=from_node,
                to_node=to_node,
                distance_m=distance_m,
                estimated_time_s=duration_s,
                cumulative_distance_m=round(total_d, 3),
                cumulative_time_s=round(total_t, 3),
                path_wkt=edge.get("path_wkt"),
            )
        )
        if edge.get("path_wkt"):
            wkt_segments.append(str(edge["path_wkt"]))

    return RoutePlan(
        weight=weight,
        distance_m=round(total_d, 3),
        estimated_time_s=round(total_t, 3),
        edges=edge_items,
        path_wkt_segments=wkt_segments,
        query_bucket_start=bucket_start.isoformat()
        if bucket_start is not None
        else None,
    )
