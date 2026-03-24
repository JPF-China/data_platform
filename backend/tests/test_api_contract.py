from datetime import date

from sqlalchemy import event, text

from app.db.session import engine
from app.db.session import SessionLocal


def test_summary_reads_precomputed_table_without_detail_dependency(client) -> None:
    db = SessionLocal()
    try:
        baseline = client.get("/api/v1/summary/daily")
        assert baseline.status_code == 200
        baseline_items = baseline.json()["items"]
        assert len(baseline_items) >= 1

        db.execute(text("TRUNCATE trip_segments, trips RESTART IDENTITY CASCADE"))
        db.commit()

        after_truncate = client.get("/api/v1/summary/daily")
        assert after_truncate.status_code == 200
        assert after_truncate.json()["items"] == baseline_items
    finally:
        db.close()


def test_heatmap_requires_full_bbox_if_bbox_is_provided(client) -> None:
    res = client.get(
        "/api/v1/map/heatmap",
        params={
            "metric_date": date(2015, 1, 3).isoformat(),
            "bucket_start": "2015-01-03T08:00:00",
            "min_lat": 45.7,
            "min_lon": 126.5,
            "max_lat": 45.8,
        },
    )
    assert res.status_code == 400
    assert "all of min_lat/min_lon/max_lat/max_lon" in res.json().get("detail", "")


def test_heatmap_rejects_invalid_bbox_order(client) -> None:
    res = client.get(
        "/api/v1/map/heatmap",
        params={
            "metric_date": date(2015, 1, 3).isoformat(),
            "bucket_start": "2015-01-03T08:00:00",
            "min_lat": 45.8,
            "min_lon": 126.7,
            "max_lat": 45.7,
            "max_lon": 126.6,
        },
    )
    assert res.status_code == 400
    assert "bbox bounds must satisfy" in res.json().get("detail", "")


def test_route_compare_maps_value_error_to_http_400(client, monkeypatch) -> None:
    def _raise_value_error(_db, _payload):
        raise ValueError("synthetic routing error")

    monkeypatch.setattr("app.api.routes.compare_routes", _raise_value_error)

    payload = {
        "start_time": "2026-03-20T08:00:00",
        "query_time": "2026-03-20T08:00:00",
        "start_point": {"lat": 45.756, "lon": 126.642},
        "end_point": {"lat": 45.721, "lon": 126.588},
    }
    res = client.post("/api/v1/route/compare", json=payload)
    assert res.status_code == 400
    assert res.json() == {"detail": "synthetic routing error"}


def test_route_compare_rejects_invalid_point_range(client) -> None:
    payload = {
        "start_time": "2026-03-20T08:00:00",
        "query_time": "2026-03-20T08:00:00",
        "start_point": {"lat": 123.0, "lon": 126.642},
        "end_point": {"lat": 45.721, "lon": 126.588},
    }
    res = client.post("/api/v1/route/compare", json=payload)
    assert res.status_code == 422


def test_summary_response_contract_includes_expected_fields(client) -> None:
    res = client.get("/api/v1/summary/daily")
    assert res.status_code == 200

    body = res.json()
    assert isinstance(body.get("items"), list)
    if body["items"]:
        row = body["items"][0]
        assert {
            "date",
            "trip_count",
            "vehicle_count",
            "distance_km",
            "avg_speed_kmh",
        }.issubset(row.keys())


def test_heatmap_response_contract_has_time_and_geometry(client) -> None:
    bucket_res = client.get(
        "/api/v1/map/heatmap/buckets",
        params={"metric_date": date(2015, 1, 3).isoformat()},
    )
    assert bucket_res.status_code == 200
    buckets = bucket_res.json().get("items", [])
    if not buckets:
        return

    res = client.get(
        "/api/v1/map/heatmap",
        params={"metric_date": "2015-01-03", "bucket_start": buckets[0]},
    )
    assert res.status_code == 200

    body = res.json()
    assert isinstance(body.get("items"), list)
    if body["items"]:
        row = body["items"][0]
        assert {
            "road_id",
            "road_name",
            "flow_count",
            "distance_m",
            "time_bucket_start",
            "time_bucket_end",
            "geometry",
        }.issubset(row.keys())


def test_route_capability_issues_is_string_list(client) -> None:
    res = client.get("/api/v1/route/capability")
    assert res.status_code == 200
    issues = res.json().get("issues")
    assert isinstance(issues, list)
    assert all(isinstance(item, str) for item in issues)


def test_summary_endpoint_does_not_query_detail_tables(client) -> None:
    statements: list[str] = []

    def _capture(_conn, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement.lower())

    event.listen(engine, "before_cursor_execute", _capture)
    try:
        res = client.get("/api/v1/summary/daily")
        assert res.status_code == 200
    finally:
        event.remove(engine, "before_cursor_execute", _capture)

    sql_text = "\n".join(statements)
    assert "daily_metrics" in sql_text
    assert " from trips" not in sql_text
    assert " from trip_segments" not in sql_text
    assert " from trip_points_raw" not in sql_text
    assert " from trip_points_matched" not in sql_text
    assert " from trip_match_meta" not in sql_text


def test_openapi_contains_examples_for_summary_and_route_compare(client) -> None:
    res = client.get("/openapi.json")
    assert res.status_code == 200
    spec = res.json()

    summary_example = spec["paths"]["/api/v1/summary/daily"]["get"]["responses"]["200"][
        "content"
    ]["application/json"]["example"]
    assert "items" in summary_example
    assert isinstance(summary_example["items"], list)

    route_compare_example = spec["paths"]["/api/v1/route/compare"]["post"][
        "requestBody"
    ]["content"]["application/json"]["example"]
    assert "query_time" in route_compare_example
    assert "start_point" in route_compare_example
