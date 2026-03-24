def test_route_capability_contract(client):
    res = client.get("/api/v1/route/capability")
    assert res.status_code == 200

    body = res.json()
    assert "ready" in body
    assert "pgrouting_available" in body
    assert "road_segments_ready" in body
    assert "edge_count" in body
    assert "stats_initialized" in body
    assert "speed_bins_ready" in body
    assert "speed_bins_count" in body
    assert "issues" in body

    assert isinstance(body["ready"], bool)
    assert isinstance(body["pgrouting_available"], bool)
    assert isinstance(body["road_segments_ready"], bool)
    assert isinstance(body["edge_count"], int)
    assert isinstance(body["stats_initialized"], bool)
    assert isinstance(body["speed_bins_ready"], bool)
    assert isinstance(body["speed_bins_count"], int)
    assert isinstance(body["issues"], list)
