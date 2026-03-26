from datetime import datetime

import pytest
from sqlalchemy import text

from app.db.session import SessionLocal
from app.schemas import PointInput, RouteCompareRequest
from app.services.route_service import compare_routes


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


def _reset_and_seed_road_segments() -> None:
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM route_results"))
        db.execute(text("DELETE FROM road_segments"))
        db.execute(text("DELETE FROM road_speed_bins"))
        db.execute(
            text(
                """
                INSERT INTO road_segments (
                  id, road_id, road_name, oneway, geom, length_m, source_node, target_node, travel_time_s, source
                ) VALUES
                  (101, 'rt_12', 'Route 1-2', false,
                   ST_GeomFromText('LINESTRING(126.0000 45.0000,126.0100 45.0000)', 4326),
                   2000.0, 1, 2, 400.0, 'route_test'),
                  (102, 'rt_24', 'Route 2-4', false,
                   ST_GeomFromText('LINESTRING(126.0100 45.0000,126.0200 45.0000)', 4326),
                   2000.0, 2, 4, 400.0, 'route_test'),
                  (103, 'rt_13', 'Route 1-3', false,
                   ST_GeomFromText('LINESTRING(126.0000 45.0000,126.0000 45.0100)', 4326),
                   2500.0, 1, 3, 100.0, 'route_test'),
                  (104, 'rt_34', 'Route 3-4', false,
                   ST_GeomFromText('LINESTRING(126.0000 45.0100,126.0200 45.0000)', 4326),
                   2500.0, 3, 4, 100.0, 'route_test')
                """
            )
        )
        db.commit()
    finally:
        db.close()


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


def _seed_speed_bins() -> None:
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM road_speed_bins"))
        db.execute(
            text(
                """
                INSERT INTO road_speed_bins (
                  road_id, bucket_start, bucket_end,
                  median_speed_kmh, mean_speed_kmh, sample_count
                ) VALUES
                  ('rt_12',
                   '2026-03-20 08:00:00'::timestamp,
                   '2026-03-20 08:05:00'::timestamp,
                   90.0, 90.0, 10),
                  ('rt_12',
                   '2026-03-20 09:00:00'::timestamp,
                   '2026-03-20 09:05:00'::timestamp,
                   20.0, 20.0, 5),
                  ('rt_24',
                   '2026-03-20 08:00:00'::timestamp,
                   '2026-03-20 08:05:00'::timestamp,
                   90.0, 90.0, 10),
                  ('rt_24',
                   '2026-03-20 09:00:00'::timestamp,
                   '2026-03-20 09:05:00'::timestamp,
                   20.0, 20.0, 5),
                  ('rt_13',
                   '2026-03-20 08:00:00'::timestamp,
                   '2026-03-20 08:05:00'::timestamp,
                   90.0, 90.0, 10),
                  ('rt_13',
                   '2026-03-20 09:00:00'::timestamp,
                   '2026-03-20 09:05:00'::timestamp,
                   20.0, 20.0, 5),
                  ('rt_34',
                   '2026-03-20 08:00:00'::timestamp,
                   '2026-03-20 08:05:00'::timestamp,
                   90.0, 90.0, 10),
                  ('rt_34',
                   '2026-03-20 09:00:00'::timestamp,
                   '2026-03-20 09:05:00'::timestamp,
                   20.0, 20.0, 5)
                """
            )
        )
        db.commit()
    finally:
        db.close()


def test_route_compare_prefers_pgrouting_result():
    _ensure_pgrouting_available()
    _reset_and_seed_road_segments()
    _seed_stats_ready_marker()

    db = SessionLocal()
    try:
        payload = RouteCompareRequest(
            start_time=datetime.fromisoformat("2026-03-20T08:00:00"),
            query_time=datetime.fromisoformat("2026-03-20T08:00:00"),
            start_point=PointInput(lat=45.0000, lon=126.0001),
            end_point=PointInput(lat=45.0001, lon=126.0199),
        )

        result = compare_routes(db, payload)
        shortest = result.shortest_route
        fastest = result.fastest_route

        assert result.snapped_start_point.node_id == result.nearest_start_node
        assert result.snapped_end_point.node_id == result.nearest_end_node
        assert result.snapped_start_point.snap_distance_m >= 0
        assert result.snapped_end_point.snap_distance_m >= 0

        assert shortest.weight == "distance_m"
        assert fastest.weight == "travel_time_s"

        shortest_edge_ids = [edge.edge_id for edge in shortest.edges]
        fastest_edge_ids = [edge.edge_id for edge in fastest.edges]

        assert shortest_edge_ids == [101, 102]
        assert fastest_edge_ids == [101, 102]
        assert shortest.distance_m == 4000.0
        assert shortest.estimated_time_s == 800.0
        assert fastest.distance_m == 4000.0
        assert fastest.estimated_time_s == 800.0
    finally:
        db.close()


def test_route_edges_are_continuous_and_cumulative_values_increase():
    _ensure_pgrouting_available()
    _reset_and_seed_road_segments()
    _seed_stats_ready_marker()

    db = SessionLocal()
    try:
        payload = RouteCompareRequest(
            start_time=datetime.fromisoformat("2026-03-20T08:00:00"),
            query_time=datetime.fromisoformat("2026-03-20T08:00:00"),
            start_point=PointInput(lat=45.0000, lon=126.0001),
            end_point=PointInput(lat=45.0001, lon=126.0199),
        )
        result = compare_routes(db, payload)

        for key in ["shortest_route", "fastest_route"]:
            route = getattr(result, key)
            edges = route.edges
            assert len(edges) >= 1

            previous_distance = 0.0
            previous_time = 0.0
            for edge in edges:
                assert edge.from_node is not None
                assert edge.to_node is not None
                assert edge.cumulative_distance_m > previous_distance
                assert edge.cumulative_time_s > previous_time
                previous_distance = edge.cumulative_distance_m
                previous_time = edge.cumulative_time_s

        assert result.snapped_start_point.node_id > 0
        assert result.snapped_end_point.node_id > 0
    finally:
        db.close()


def test_route_results_persisted_with_pgrouting_meta():
    _ensure_pgrouting_available()
    _reset_and_seed_road_segments()
    _seed_stats_ready_marker()

    db = SessionLocal()
    try:
        payload = RouteCompareRequest(
            start_time=datetime.fromisoformat("2026-03-20T08:00:00"),
            query_time=datetime.fromisoformat("2026-03-20T08:00:00"),
            start_point=PointInput(lat=45.0000, lon=126.0001),
            end_point=PointInput(lat=45.0001, lon=126.0199),
        )
        compare_routes(db, payload)

        rows = (
            db.execute(
                text(
                    """
                SELECT route_type, distance_m, estimated_time_s, meta, query_time
                FROM route_results
                ORDER BY id
                """
                )
            )
            .mappings()
            .all()
        )

        assert len(rows) == 2
        assert {row["route_type"] for row in rows} == {"shortest", "fastest"}
        for row in rows:
            assert row["distance_m"] > 0
            assert row["estimated_time_s"] > 0
            assert row["meta"]["source"] == "pgrouting"
            assert row["query_time"].replace(tzinfo=None) == payload.query_time
    finally:
        db.close()


def test_route_query_time_required():
    _ensure_pgrouting_available()
    _reset_and_seed_road_segments()
    _seed_stats_ready_marker()

    db = SessionLocal()
    try:
        payload_missing = {
            "start_time": "2026-03-20T08:00:00",
            "start_point": {"lat": 45.0000, "lon": 126.0001},
            "end_point": {"lat": 45.0001, "lon": 126.0199},
        }
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        res = client.post("/api/v1/route/compare", json=payload_missing)
        assert res.status_code == 422
    finally:
        db.close()


def test_fastest_route_differs_by_query_time():
    _ensure_pgrouting_available()
    _reset_and_seed_road_segments()
    _seed_stats_ready_marker()
    _seed_speed_bins()

    db = SessionLocal()
    try:
        morning_payload = RouteCompareRequest(
            start_time=datetime.fromisoformat("2026-03-20T08:00:00"),
            query_time=datetime.fromisoformat("2026-03-20T08:02:30"),
            start_point=PointInput(lat=45.0000, lon=126.0001),
            end_point=PointInput(lat=45.0001, lon=126.0199),
        )
        morning_result = compare_routes(db, morning_payload)

        rush_hour_payload = RouteCompareRequest(
            start_time=datetime.fromisoformat("2026-03-20T09:00:00"),
            query_time=datetime.fromisoformat("2026-03-20T09:03:00"),
            start_point=PointInput(lat=45.0000, lon=126.0001),
            end_point=PointInput(lat=45.0001, lon=126.0199),
        )
        rush_result = compare_routes(db, rush_hour_payload)

        morning_fastest = morning_result.fastest_route
        rush_fastest = rush_result.fastest_route

        assert morning_fastest.estimated_time_s < rush_fastest.estimated_time_s
        assert morning_fastest.distance_m == rush_fastest.distance_m
        assert morning_result.query_bucket_start == "2026-03-20T08:00:00"
        assert rush_result.query_bucket_start == "2026-03-20T09:00:00"
    finally:
        db.close()


def test_fastest_route_uses_speed_bins_when_available():
    _ensure_pgrouting_available()
    _reset_and_seed_road_segments()
    _seed_stats_ready_marker()
    _seed_speed_bins()

    db = SessionLocal()
    try:
        payload = RouteCompareRequest(
            start_time=datetime.fromisoformat("2026-03-20T08:00:00"),
            query_time=datetime.fromisoformat("2026-03-20T08:02:30"),
            start_point=PointInput(lat=45.0000, lon=126.0001),
            end_point=PointInput(lat=45.0001, lon=126.0199),
        )
        result = compare_routes(db, payload)

        fastest = result.fastest_route
        assert fastest.weight == "travel_time_s"
        assert fastest.estimated_time_s > 0
        assert fastest.distance_m > 0
        assert len(fastest.edges) >= 1
        assert fastest.query_bucket_start == "2026-03-20T08:00:00"
        assert fastest.estimated_time_s < 500.0
    finally:
        db.close()


def test_fastest_route_fallback_when_no_speed_bins():
    _ensure_pgrouting_available()
    _reset_and_seed_road_segments()
    _seed_stats_ready_marker()

    db = SessionLocal()
    try:
        payload = RouteCompareRequest(
            start_time=datetime.fromisoformat("2026-03-20T08:00:00"),
            query_time=datetime.fromisoformat("2026-03-20T08:02:30"),
            start_point=PointInput(lat=45.0000, lon=126.0001),
            end_point=PointInput(lat=45.0001, lon=126.0199),
        )
        result = compare_routes(db, payload)

        fastest = result.fastest_route
        shortest = result.shortest_route
        assert fastest.weight == "travel_time_s"
        assert fastest.estimated_time_s > 0
        assert fastest.distance_m > 0
        assert fastest.query_bucket_start == "2026-03-20T08:00:00"
        assert fastest.estimated_time_s >= 500.0
        assert [edge.edge_id for edge in fastest.edges] == [
            edge.edge_id for edge in shortest.edges
        ]
    finally:
        db.close()


def test_route_capability_includes_speed_bins(client):
    res = client.get("/api/v1/route/capability")
    assert res.status_code == 200

    body = res.json()
    assert "speed_bins_ready" in body
    assert "speed_bins_count" in body
    assert isinstance(body["speed_bins_ready"], bool)
    assert isinstance(body["speed_bins_count"], int)


def test_route_requires_stats_initialization_marker():
    _ensure_pgrouting_available()
    _reset_and_seed_road_segments()

    db = SessionLocal()
    try:
        db.execute(
            text("DELETE FROM table_row_stats WHERE table_name = 'road_speed_bins'")
        )
        db.commit()

        payload = RouteCompareRequest(
            start_time=datetime.fromisoformat("2026-03-20T08:00:00"),
            query_time=datetime.fromisoformat("2026-03-20T08:00:00"),
            start_point=PointInput(lat=45.0000, lon=126.0001),
            end_point=PointInput(lat=45.0001, lon=126.0199),
        )

        with pytest.raises(ValueError, match="stats module is not initialized"):
            compare_routes(db, payload)
    finally:
        db.close()
