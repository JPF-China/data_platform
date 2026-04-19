import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { act } from "react";

import App from "./App";

vi.mock("maplibre-gl", () => {
  class FakeMap {
    container: unknown;
    constructor(cfg?: { container?: unknown }) {
      this.container = cfg?.container ?? null;
    }
    addControl() {}
    on(event: string, cb: () => void) {
      if (event === "load") cb();
    }
    addSource() {}
    addLayer() {}
    getSource() {
      return { setData: () => {} };
    }
    getLayer() {
      return {};
    }
    setLayoutProperty() {}
    fitBounds() {}
    resize() {}
    getContainer() {
      return this.container;
    }
    remove() {}
  }
  return {
    default: {
      Map: FakeMap,
      NavigationControl: class {},
    },
  };
});

function mockResponse(url: string) {
  if (url.includes("/meta/dates")) {
    return {
      summary_dates: ["2015-01-03"],
      heatmap_dates: ["2015-01-03"],
      route_dates: ["2015-01-03"],
      default_summary_date: "2015-01-03",
      default_heatmap_date: "2015-01-03",
      default_route_date: "2015-01-03",
      refreshed_at: "2026-04-19T12:00:00",
    };
  }
  if (url.includes("/meta/assets")) {
    return {
      items: [
        {
          asset_key: "ads_daily_metrics",
          display_name: "总览指标",
          asset_layer: "ADS",
          asset_type: "table",
          source_table: "daily_metrics",
          status: "ready",
          row_count: 1,
          refreshed_at: "2026-04-19T12:00:00",
        },
      ],
    };
  }
  if (url.includes("/meta/portal-summary")) {
    return {
      total_asset_count: 4,
      total_ready_count: 4,
      total_rows: 128,
      refreshed_at: "2026-04-19T12:00:00",
      items: [
        {
          asset_layer: "ODS",
          asset_count: 1,
          ready_count: 1,
          total_rows: 12,
          completion_rate: 1,
        },
        {
          asset_layer: "DW",
          asset_count: 1,
          ready_count: 1,
          total_rows: 24,
          completion_rate: 1,
        },
        {
          asset_layer: "TDM",
          asset_count: 1,
          ready_count: 1,
          total_rows: 36,
          completion_rate: 1,
        },
        {
          asset_layer: "ADS",
          asset_count: 1,
          ready_count: 1,
          total_rows: 56,
          completion_rate: 1,
        },
      ],
    };
  }
  if (url.includes("/meta/jobs/latest")) {
    return {
      item: {
        job_name: "pipeline",
        latest_run_id: 1,
        status: "success",
        finished_at: "2026-04-19T12:00:00",
        message: "pipeline_refresh completed successfully",
        details: {},
      },
    };
  }
  if (url.includes("/crowd/profile-summary")) {
    return {
      total_vehicle_count: 12,
      tagged_vehicle_count: 11,
      tag_count: 2,
      updated_at: "2026-04-19T12:00:00",
      items: [
        {
          tag_code: "commuter",
          tag_name: "高峰通勤车",
          vehicle_count: 7,
          avg_trip_count: 4.2,
          avg_trip_distance_m: 5200,
          avg_speed_kmh: 31,
        },
        {
          tag_code: "night_active",
          tag_name: "夜间活跃车",
          vehicle_count: 4,
          avg_trip_count: 2.6,
          avg_trip_distance_m: 3800,
          avg_speed_kmh: 28,
        },
      ],
    };
  }
  if (url.includes("/crowd/vehicles")) {
    return {
      items: [
        {
          vehicle_id: "seed_vehicle_1",
          active_days: 3,
          trip_count: 6,
          total_distance_m: 15000,
          avg_trip_distance_m: 2500,
          avg_speed_kmh: 31,
          dominant_start_hour: 8,
          tags: ["高峰通勤车"],
        },
      ],
    };
  }
  if (url.includes("/crowd/segments")) {
    return {
      items: [
        {
          tag_code: "commuter",
          tag_name: "高峰通勤车",
          road_id: "seed_r1",
          road_name: "Seed Road 1",
          trip_count: 6,
          vehicle_count: 3,
          distance_m: 9000,
          avg_speed_kmh: 33,
          geometry: JSON.stringify({
            type: "LineString",
            coordinates: [
              [126.642, 45.756],
              [126.62, 45.74],
            ],
          }),
        },
      ],
    };
  }
  if (url.includes("/recommend/route")) {
    return {
      start_time: "2015-01-03T08:00:00",
      query_time: "2015-01-03T08:00:00",
      query_bucket_start: "2015-01-03T08:00:00",
      recommended_strategy: "fastest",
      used_dynamic_speed: true,
      fallback_mode: "dynamic_speed",
      summary: "推荐最快路径，预计可节省 20.0 秒。",
      reasons: ["已命中动态速度桶，推荐基于历史时段速度特征。"],
      time_saved_s: 20,
      distance_delta_m: 50,
      recommended_route: {
        distance_m: 1150,
        estimated_time_s: 160,
        path_wkt_segments: ["LINESTRING(126.61 45.71,126.62 45.72)"],
        edges: [],
      },
      alternative_route: {
        distance_m: 1200,
        estimated_time_s: 180,
        path_wkt_segments: ["LINESTRING(126.6 45.7,126.61 45.71)"],
        edges: [],
      },
      shortest_route: {
        distance_m: 1200,
        estimated_time_s: 180,
        path_wkt_segments: ["LINESTRING(126.6 45.7,126.61 45.71)"],
        edges: [],
      },
      fastest_route: {
        distance_m: 1150,
        estimated_time_s: 160,
        path_wkt_segments: ["LINESTRING(126.61 45.71,126.62 45.72)"],
        edges: [],
      },
    };
  }
  if (url.includes("/recommend/departure-window")) {
    return {
      travel_date: "2015-01-03",
      recommended_start_time: "2015-01-03T08:15:00",
      recommended_query_bucket_start: "2015-01-03T08:15:00",
      summary: "推荐在 08:15 左右出发，预计耗时 155.0 秒。",
      options: [
        {
          start_time: "2015-01-03T08:15:00",
          query_bucket_start: "2015-01-03T08:15:00",
          recommended_strategy: "fastest",
          estimated_time_s: 155,
          used_dynamic_speed: true,
          score: 155,
          summary: "08:15 路况更平稳",
        },
      ],
    };
  }
  if (url.includes("/recommend/congestion-avoidance")) {
    return {
      current_query_time: "2015-01-03T08:00:00",
      current_bucket_start: "2015-01-03T08:00:00",
      current_network_level: "balanced",
      recommended_action: "shift_departure_window",
      recommended_query_time: "2015-01-03T08:15:00",
      recommended_strategy: "fastest",
      summary: "建议把出发时间调整到 08:15，预计可减少 25.0 秒。",
      reasons: ["当前网络状态：balanced", "08:15 路况更平稳"],
    };
  }
  if (url.includes("/summary/daily")) {
    return { items: [{ date: "2015-01-03", trip_count: 10, vehicle_count: 8, distance_km: 123.4, avg_speed_kmh: 35 }] };
  }
  if (url.includes("/chart/daily-trip-count")) {
    return { items: [{ date: "2015-01-03", value: 10 }] };
  }
  if (url.includes("/chart/daily-vehicle-count")) {
    return { items: [{ date: "2015-01-03", value: 8 }] };
  }
  if (url.includes("/chart/daily-distance")) {
    return { items: [{ date: "2015-01-03", value: 123.4 }] };
  }
  if (url.includes("/chart/daily-speed-boxplot")) {
    return { items: [{ trip_date: "2015-01-03", min_value: 5, q1: 20, median: 30, q3: 40, max_value: 60, sample_count: 10 }] };
  }
  if (url.includes("/chart/daily-distance-boxplot")) {
    return { items: [{ trip_date: "2015-01-03", min_value: 100, q1: 200, median: 300, q3: 500, max_value: 900, sample_count: 10 }] };
  }
  if (url.includes("/meta/heatmap-buckets")) {
    return { items: ["2015-01-03T08:00:00+08:00"] };
  }
  if (url.includes("/map/heatmap")) {
    return {
      items: [
        {
          road_id: "1",
          flow_count: 2,
          geometry: JSON.stringify({ type: "LineString", coordinates: [[126.6, 45.7], [126.61, 45.71]] }),
        },
      ],
    };
  }
  if (url.includes("/route/compare")) {
    return {
      shortest_route: {
        distance_m: 1200,
        estimated_time_s: 180,
        path_wkt_segments: ["LINESTRING(126.6 45.7,126.61 45.71)"],
        edges: [
          {
            seq: 0,
            edge_id: 1,
            road_id: "seed_r1",
            distance_m: 700,
            estimated_time_s: 90,
            cumulative_distance_m: 700,
            cumulative_time_s: 90,
          },
        ],
      },
      fastest_route: {
        distance_m: 1150,
        estimated_time_s: 160,
        path_wkt_segments: ["LINESTRING(126.61 45.71,126.62 45.72)"],
        edges: [
          {
            seq: 0,
            edge_id: 2,
            road_id: "seed_r2",
            distance_m: 650,
            estimated_time_s: 80,
            cumulative_distance_m: 650,
            cumulative_time_s: 80,
          },
        ],
      },
    };
  }
  if (url.includes("/route/capability")) {
    return {
      ready: true,
      graph_ready: true,
      dynamic_speed_ready: true,
      route_compare_ready: true,
      pgrouting_available: true,
      road_segments_ready: true,
      edge_count: 100,
      stats_initialized: true,
      speed_bins_ready: true,
      speed_bins_count: 1000,
      issues: [],
    };
  }
  return { items: [] };
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        return {
          ok: true,
          json: async () => mockResponse(url),
        } as Response;
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders dashboard and KPI cards", async () => {
    render(<App />);
    expect(screen.getByText("工作台")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("总行程数")).toBeInTheDocument());
    expect(screen.getByText("资产门户")).toBeInTheDocument();
    expect(screen.getByText("推荐中心")).toBeInTheDocument();
    expect(screen.getByText("热力回放")).toBeInTheDocument();
    expect(screen.getByText("圈人中心")).toBeInTheDocument();
    expect(screen.getByText("答辩大屏")).toBeInTheDocument();
    expect(screen.getByText("里程箱线图")).toBeInTheDocument();
    expect(screen.getByText("速度箱线图")).toBeInTheDocument();
  });

  it("renders route result edge table after compare", async () => {
    render(<App />);
    const routeEntry = await screen.findByRole("button", { name: /路径对比/i });
    await act(async () => {
      routeEntry.click();
    });
    const btn = await screen.findByText("执行路径对比");
    await waitFor(() => expect(btn).not.toBeDisabled());
    await act(async () => {
      btn.click();
    });
    await waitFor(() => expect(screen.getByText("最短路径")).toBeInTheDocument());
    expect(screen.getByText("最快路径")).toBeInTheDocument();
    expect(screen.getByText(/边 1/i)).toBeInTheDocument();
  });

  it("shows boxplot hover hint text", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("悬停箱体可查看精确数值")).toBeInTheDocument()
    );
  });
});
