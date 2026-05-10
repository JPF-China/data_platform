def test_route_capability_includes_split_ready_flags(client) -> None:
    res = client.get("/api/v1/route/capability")
    assert res.status_code == 200

    body = res.json()
    assert {"graph_ready", "dynamic_speed_ready", "route_compare_ready"}.issubset(
        body.keys()
    )


def test_recommend_route_contract(client, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.routes.recommend_route",
        lambda _db, _payload: {
            "start_time": "2015-01-03T08:00:00",
            "query_time": "2015-01-03T08:00:00",
            "query_bucket_start": "2015-01-03T08:00:00",
            "recommended_strategy": "fastest",
            "used_dynamic_speed": True,
            "fallback_mode": "dynamic_speed",
            "summary": "推荐最快路径",
            "reasons": ["命中动态速度桶"],
            "time_saved_s": 20.0,
            "distance_delta_m": 50.0,
            "recommended_route": {
                "weight": "travel_time_s",
                "distance_m": 1150.0,
                "estimated_time_s": 160.0,
                "edges": [],
                "path_wkt_segments": [],
                "query_bucket_start": "2015-01-03T08:00:00",
            },
            "alternative_route": {
                "weight": "distance_m",
                "distance_m": 1200.0,
                "estimated_time_s": 180.0,
                "edges": [],
                "path_wkt_segments": [],
                "query_bucket_start": None,
            },
            "shortest_route": {
                "weight": "distance_m",
                "distance_m": 1200.0,
                "estimated_time_s": 180.0,
                "edges": [],
                "path_wkt_segments": [],
                "query_bucket_start": None,
            },
            "fastest_route": {
                "weight": "travel_time_s",
                "distance_m": 1150.0,
                "estimated_time_s": 160.0,
                "edges": [],
                "path_wkt_segments": [],
                "query_bucket_start": "2015-01-03T08:00:00",
            },
        },
    )

    payload = {
        "start_time": "2015-01-03T08:00:00",
        "query_time": "2015-01-03T08:00:00",
        "start_point": {"lat": 45.756, "lon": 126.642},
        "end_point": {"lat": 45.721, "lon": 126.588},
    }
    res = client.post("/api/v1/recommend/route", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["recommended_strategy"] == "fastest"
    assert "recommended_route" in body
    assert "reasons" in body


def test_recommend_departure_window_contract(client, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.routes.recommend_departure_window",
        lambda _db, _payload: {
            "travel_date": "2015-01-03",
            "recommended_start_time": "2015-01-03T08:15:00",
            "recommended_query_bucket_start": "2015-01-03T08:15:00",
            "summary": "推荐在 08:15 出发",
            "options": [
                {
                    "start_time": "2015-01-03T08:15:00",
                    "query_bucket_start": "2015-01-03T08:15:00",
                    "recommended_strategy": "fastest",
                    "estimated_time_s": 155.0,
                    "used_dynamic_speed": True,
                    "score": 155.0,
                    "summary": "08:15 更顺畅",
                }
            ],
        },
    )

    res = client.get(
        "/api/v1/recommend/departure-window",
        params={
            "travel_date": "2015-01-03",
            "start_lat": 45.756,
            "start_lon": 126.642,
            "end_lat": 45.721,
            "end_lon": 126.588,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["recommended_start_time"] == "2015-01-03T08:15:00"
    assert len(body["options"]) == 1


def test_recommend_congestion_avoidance_contract(client, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.routes.recommend_congestion_avoidance",
        lambda _db, _payload: {
            "current_query_time": "2015-01-03T08:00:00",
            "current_bucket_start": "2015-01-03T08:00:00",
            "current_network_level": "balanced",
            "recommended_action": "shift_departure_window",
            "recommended_query_time": "2015-01-03T08:15:00",
            "recommended_strategy": "fastest",
            "summary": "建议调整出发时间",
            "reasons": ["08:15 路况更平稳"],
        },
    )

    res = client.get(
        "/api/v1/recommend/congestion-avoidance",
        params={
            "start_time": "2015-01-03T08:00:00",
            "query_time": "2015-01-03T08:00:00",
            "start_lat": 45.756,
            "start_lon": 126.642,
            "end_lat": 45.721,
            "end_lon": 126.588,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["recommended_action"] == "shift_departure_window"
    assert body["recommended_strategy"] == "fastest"
