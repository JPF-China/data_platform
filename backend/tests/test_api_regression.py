from datetime import date


def test_healthz(client):
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_daily_summary(client):
    res = client.get("/api/v1/summary/daily")
    assert res.status_code == 200
    payload = res.json()
    assert "items" in payload
    assert isinstance(payload["items"], list)
    if payload["items"]:
        row = payload["items"][0]
        assert {"date", "trip_count", "vehicle_count", "distance_km"}.issubset(
            row.keys()
        )


def test_chart_endpoints(client):
    for path in [
        "/api/v1/chart/daily-trip-count",
        "/api/v1/chart/daily-vehicle-count",
        "/api/v1/chart/daily-distance",
        "/api/v1/chart/daily-distance-boxplot",
        "/api/v1/chart/daily-speed-boxplot",
    ]:
        res = client.get(path)
        assert res.status_code == 200
        assert "items" in res.json()


def test_heatmap_buckets_and_heatmap(client):
    res = client.get(
        "/api/v1/map/heatmap/buckets",
        params={"metric_date": date(2015, 1, 3).isoformat()},
    )
    assert res.status_code == 200
    buckets = res.json().get("items", [])
    assert isinstance(buckets, list)
    assert len(buckets) > 0

    res2 = client.get(
        "/api/v1/map/heatmap",
        params={"metric_date": "2015-01-03", "bucket_start": buckets[0]},
    )
    assert res2.status_code == 200
    items = res2.json().get("items", [])
    assert isinstance(items, list)
    if items:
        assert "geometry" in items[0]
        assert "flow_count" in items[0]


def test_route_compare_and_persistence(client):
    payload = {
        "start_time": "2026-03-20T08:00:00",
        "query_time": "2026-03-20T08:00:00",
        "start_point": {"lat": 45.756, "lon": 126.642},
        "end_point": {"lat": 45.721, "lon": 126.588},
    }
    res = client.post("/api/v1/route/compare", json=payload)
    if res.status_code == 400:
        detail = res.json().get("detail", "")
        assert (
            "pgrouting extension is unavailable" in detail
            or "stats module is not initialized" in detail
        )
        return

    assert res.status_code == 200
    body = res.json()
    assert "shortest_route" in body
    assert "fastest_route" in body
    assert "snapped_start_point" in body
    assert "snapped_end_point" in body
    assert "edges" in body["shortest_route"]
    assert len(body["shortest_route"]["edges"]) >= 1
    first = body["shortest_route"]["edges"][0]
    assert {"seq", "edge_id", "distance_m", "estimated_time_s"}.issubset(first.keys())
    assert "query_bucket_start" in body["fastest_route"]


def test_route_capability_endpoint(client):
    res = client.get("/api/v1/route/capability")
    assert res.status_code == 200
    body = res.json()
    assert {
        "ready",
        "pgrouting_available",
        "road_segments_ready",
        "edge_count",
        "stats_initialized",
        "speed_bins_ready",
        "speed_bins_count",
        "issues",
    }.issubset(body.keys())
