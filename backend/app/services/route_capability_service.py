from sqlalchemy import text
from sqlalchemy.orm import Session


def get_route_capability(db: Session) -> dict[str, object]:
    pgrouting_available = bool(
        db.execute(
            text("SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'pgr_dijkstra')")
        ).scalar_one()
    )

    edge_count = int(
        db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM road_segments
                WHERE source_node IS NOT NULL
                  AND target_node IS NOT NULL
                  AND geom IS NOT NULL
                """
            )
        ).scalar_one()
    )

    speed_bins_count = int(
        db.execute(text("SELECT COUNT(*) FROM road_speed_bins")).scalar_one()
    )

    stats_initialized = bool(
        db.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM table_row_stats
                  WHERE table_name = 'road_speed_bins'
                )
                """
            )
        ).scalar_one()
    )

    road_segments_ready = edge_count > 0
    speed_bins_ready = speed_bins_count > 0
    issues: list[str] = []
    if not pgrouting_available:
        issues.append("pgrouting extension is unavailable")
    if not road_segments_ready:
        issues.append("road_segments graph is empty")
    if not stats_initialized:
        issues.append("stats module is not initialized for routing")
    if not speed_bins_ready:
        issues.append(
            "road_speed_bins is empty (fastest route will use static weights)"
        )

    return {
        "ready": pgrouting_available and road_segments_ready and stats_initialized,
        "pgrouting_available": pgrouting_available,
        "road_segments_ready": road_segments_ready,
        "edge_count": edge_count,
        "stats_initialized": stats_initialized,
        "speed_bins_ready": speed_bins_ready,
        "speed_bins_count": speed_bins_count,
        "issues": issues,
    }
