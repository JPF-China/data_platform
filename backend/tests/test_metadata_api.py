from datetime import date


def test_meta_assets_returns_catalog_items(client) -> None:
    res = client.get("/api/v1/meta/assets")
    assert res.status_code == 200

    body = res.json()
    assert isinstance(body.get("items"), list)
    assert len(body["items"]) >= 1
    layers = {item["asset_layer"] for item in body["items"]}
    assert {"ODS", "DW", "TDM", "ADS"}.issubset(layers)
    first = body["items"][0]
    assert {
        "asset_key",
        "display_name",
        "asset_layer",
        "source_table",
        "status",
        "row_count",
    }.issubset(first.keys())
    asset_lookup = {item["asset_key"]: item for item in body["items"]}
    assert asset_lookup["tdm_area_activity_profile"]["asset_layer"] == "TDM"
    assert asset_lookup["tdm_time_bucket_feature"]["asset_layer"] == "TDM"
    assert asset_lookup["ads_daily_metrics"]["source_table"] == "ads_dashboard_daily"
    assert asset_lookup["ads_heatmap"]["source_table"] == "ads_heatmap_replay"


def test_meta_dates_returns_dynamic_date_ranges(client) -> None:
    res = client.get("/api/v1/meta/dates")
    assert res.status_code == 200

    body = res.json()
    assert "summary_dates" in body
    assert "heatmap_dates" in body
    assert "route_dates" in body
    assert "default_heatmap_date" in body
    assert "2015-01-03" in body["summary_dates"]
    assert "2015-01-03" in body["heatmap_dates"]


def test_meta_portal_summary_returns_layer_rollup(client) -> None:
    res = client.get("/api/v1/meta/portal-summary")
    assert res.status_code == 200

    body = res.json()
    assert body["total_asset_count"] >= 1
    assert body["total_ready_count"] >= 1
    assert body["total_rows"] >= 1
    assert isinstance(body["items"], list)
    assert {"ODS", "DW", "TDM", "ADS"}.issubset(
        {item["asset_layer"] for item in body["items"]}
    )
    first = body["items"][0]
    assert {
        "asset_layer",
        "asset_count",
        "ready_count",
        "total_rows",
        "completion_rate",
    }.issubset(first.keys())
    assert body["total_ready_count"] == body["total_asset_count"]


def test_meta_latest_job_returns_pipeline_status(client) -> None:
    res = client.get("/api/v1/meta/jobs/latest")
    assert res.status_code == 200

    body = res.json()
    assert "item" in body
    assert body["item"] is not None
    assert body["item"]["job_name"] == "pipeline"
    assert body["item"]["status"] == "success"


def test_meta_heatmap_buckets_matches_available_date(client) -> None:
    res = client.get(
        "/api/v1/meta/heatmap-buckets",
        params={"metric_date": date(2015, 1, 3).isoformat()},
    )
    assert res.status_code == 200
    assert isinstance(res.json().get("items"), list)
    assert len(res.json()["items"]) >= 1


def test_meta_capability_combines_route_and_dates(client) -> None:
    res = client.get("/api/v1/meta/capability")
    assert res.status_code == 200

    body = res.json()
    assert "route" in body
    assert "latest_job" in body
    assert "heatmap_dates" in body
    assert "summary_dates" in body
    assert "ready" in body["route"]
