import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { act } from "react";

import App from "./App";

vi.mock("maplibre-gl", () => {
  class FakeMap {
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
  if (url.includes("/map/heatmap/buckets")) {
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
    expect(screen.getByText("Urban Mobility Command Board")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Total Trips")).toBeInTheDocument());
    expect(screen.getByText("Distance Boxplot")).toBeInTheDocument();
    expect(screen.getByText("Speed Boxplot")).toBeInTheDocument();
    expect(screen.getByText("Heatmap Playback")).toBeInTheDocument();
  });

  it("renders route result edge table after compare", async () => {
    render(<App />);
    const btn = await screen.findByText("Run Route Compare");
    await act(async () => {
      btn.click();
    });
    await waitFor(() => expect(screen.getByText("Shortest Route")).toBeInTheDocument());
    expect(screen.getByText("Fastest Route")).toBeInTheDocument();
    expect(screen.getByText(/edge 1/i)).toBeInTheDocument();
  });

  it("shows boxplot hover hint text", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Hover a box to see exact values")).toBeInTheDocument()
    );
  });
});
