from datetime import datetime

import pytest
from sqlalchemy import text

from app.db.session import SessionLocal
from app.schemas import PointInput, RouteCompareRequest
from app.services.route_service import compare_routes


def _seed_stats_ready_marker() -> None:
    db = SessionLocal()
    try:
        db.execute(
            text("DELETE FROM table_row_stats WHERE table_name = 'road_speed_bins'")
        )
        db.execute(
            text(
                """
                INSERT INTO table_row_stats (table_name, row_count, refreshed_at)
                VALUES ('road_speed_bins', 0, now())
                """
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_route_graph() -> None:
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM route_results"))
        db.execute(text("DELETE FROM road_segments"))
        db.execute(text("DELETE FROM road_speed_bins"))
        db.execute(
            text(
                """
                INSERT INTO road_segments (
                  id, road_id, road_name, oneway, geom, length_m,
                  source_node, target_node, travel_time_s, source
                ) VALUES
                  (201, 'seed_rs_1', 'Seed Segment 1', false,
                   ST_GeomFromText('LINESTRING(126.642000 45.756000,126.620000 45.740000)', 4326),
                   3000.0, 1001, 1002, 300.0, 'seed'),
                  (202, 'seed_rs_2', 'Seed Segment 2', false,
                   ST_GeomFromText('LINESTRING(126.620000 45.740000,126.588000 45.721000)', 4326),
                   4000.0, 1002, 1003, 300.0, 'seed')
                """
            )
        )
        db.commit()
    finally:
        db.close()


def _ensure_pgrouting_available() -> None:
    db = SessionLocal()
    try:
        available = db.execute(
            text("SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'pgr_dijkstra')")
        ).scalar_one()
        if not bool(available):
            pytest.skip("pgrouting extension is unavailable in current environment")
    finally:
        db.close()


def test_route_is_segment_graph_based():
    _ensure_pgrouting_available()
    _seed_stats_ready_marker()
    _seed_route_graph()
    db = SessionLocal()
    try:
        payload = RouteCompareRequest(
            start_time=datetime.fromisoformat("2026-03-20T08:00:00"),
            query_time=datetime.fromisoformat("2026-03-20T08:00:00"),
            start_point=PointInput(lat=45.756, lon=126.642),
            end_point=PointInput(lat=45.721, lon=126.588),
        )
        res = compare_routes(db, payload)
        shortest = res.shortest_route
        assert shortest.weight == "distance_m"
        assert len(shortest.edges) >= 1
        first_edge = shortest.edges[0]
        assert first_edge.seq >= 0
        assert first_edge.edge_id > 0
        assert first_edge.road_id is not None
        assert first_edge.from_node is not None
        assert first_edge.to_node is not None
        assert first_edge.distance_m > 0
        assert first_edge.estimated_time_s > 0
        assert first_edge.cumulative_distance_m > 0
        assert first_edge.cumulative_time_s > 0
    finally:
        db.close()
