def test_crowd_profile_summary_returns_tag_distribution(client) -> None:
    res = client.get("/api/v1/crowd/profile-summary")
    assert res.status_code == 200

    body = res.json()
    assert body["total_vehicle_count"] >= 1
    assert body["tagged_vehicle_count"] >= 1
    assert body["tag_count"] >= 1
    assert isinstance(body["items"], list)
    assert any(item["tag_code"] == "commuter" for item in body["items"])


def test_crowd_vehicles_supports_tag_filter(client) -> None:
    res = client.get("/api/v1/crowd/vehicles", params={"tag_code": "commuter"})
    assert res.status_code == 200

    body = res.json()
    assert isinstance(body["items"], list)
    assert len(body["items"]) >= 1
    first = body["items"][0]
    assert first["vehicle_id"] == "seed_vehicle_1"
    assert "高峰通勤车" in first["tags"]


def test_crowd_segments_returns_hot_roads_for_tag(client) -> None:
    res = client.get("/api/v1/crowd/segments", params={"tag_code": "commuter"})
    assert res.status_code == 200

    body = res.json()
    assert isinstance(body["items"], list)
    assert len(body["items"]) >= 1
    first = body["items"][0]
    assert first["tag_code"] == "commuter"
    assert first["road_id"] in {"seed_r1", "seed_r2"}
    assert first["trip_count"] >= 1
    assert first["geometry"] is None


def test_crowd_segments_can_include_geometry_for_backward_compatibility(client) -> None:
    res = client.get(
        "/api/v1/crowd/segments",
        params={"tag_code": "commuter", "include_geometry": "true"},
    )
    assert res.status_code == 200

    body = res.json()
    assert isinstance(body["items"], list)
    assert len(body["items"]) >= 1
    assert body["items"][0]["geometry"] is not None


def test_crowd_segment_geometry_returns_single_road_geometry(client) -> None:
    res = client.get("/api/v1/crowd/segments/seed_r1/geometry")
    assert res.status_code == 200

    body = res.json()
    assert body["road_id"] == "seed_r1"
    assert body["geometry"] is not None
    assert body["source_segment_count"] >= 1
