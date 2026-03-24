export type DailyPoint = { date: string; value: number };

export type SummaryRow = {
  date: string;
  trip_count: number;
  vehicle_count: number;
  distance_km: number;
  avg_speed_kmh: number | null;
};

export type BoxRow = {
  trip_date: string;
  min_value: number;
  q1: number;
  median: number;
  q3: number;
  max_value: number;
  sample_count: number;
};

export type HeatItem = {
  road_id: string | null;
  flow_count: number;
  geometry: string;
  time_bucket_start: string;
  road_name?: string | null;
  trip_count?: number;
  vehicle_count?: number;
  distance_m?: number;
};

export type RouteEdge = {
  seq: number;
  edge_id: number;
  road_id?: string | null;
  distance_m: number;
  estimated_time_s: number;
  cumulative_distance_m: number;
  cumulative_time_s: number;
  path_wkt?: string | null;
};

export type RouteData = {
  distance_m: number;
  estimated_time_s: number;
  edges: RouteEdge[];
  path_wkt_segments?: string[];
};

export type RouteResult = {
  shortest_route?: RouteData;
  fastest_route?: RouteData;
};

export type RoutePayload = {
  start_time: string;
  query_time: string;
  start_point: { lat: number; lon: number };
  end_point: { lat: number; lon: number };
};

export type RouteCapability = {
  ready: boolean;
  pgrouting_available: boolean;
  road_segments_ready: boolean;
  edge_count: number;
  stats_initialized: boolean;
  speed_bins_ready: boolean;
  speed_bins_count: number;
  issues: string[];
};

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "http://127.0.0.1:8000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  const data = (await res.json()) as T & { detail?: string };
  if (!res.ok) {
    throw new Error((data as { detail?: string }).detail ?? `API failed: ${path}`);
  }
  return data;
}

export async function fetchSummary(): Promise<SummaryRow[]> {
  const data = await request<{ items: SummaryRow[] }>("/summary/daily");
  return data.items ?? [];
}

export async function fetchTripCount(): Promise<DailyPoint[]> {
  const data = await request<{ items: DailyPoint[] }>("/chart/daily-trip-count");
  return data.items ?? [];
}

export async function fetchVehicleCount(): Promise<DailyPoint[]> {
  const data = await request<{ items: DailyPoint[] }>("/chart/daily-vehicle-count");
  return data.items ?? [];
}

export async function fetchDailyDistance(): Promise<DailyPoint[]> {
  const data = await request<{ items: DailyPoint[] }>("/chart/daily-distance");
  return data.items ?? [];
}

export async function fetchSpeedBoxplot(): Promise<BoxRow[]> {
  const data = await request<{ items: BoxRow[] }>("/chart/daily-speed-boxplot");
  return data.items ?? [];
}

export async function fetchDistanceBoxplot(): Promise<BoxRow[]> {
  const data = await request<{ items: BoxRow[] }>("/chart/daily-distance-boxplot");
  return data.items ?? [];
}

export async function fetchHeatmapBuckets(metricDate: string): Promise<string[]> {
  const data = await request<{ items: string[] }>(
    `/map/heatmap/buckets?metric_date=${encodeURIComponent(metricDate)}`
  );
  return data.items ?? [];
}

export async function fetchHeatmap(params: {
  metricDate: string;
  bucketStart: string;
  minLat?: number;
  minLon?: number;
  maxLat?: number;
  maxLon?: number;
}): Promise<HeatItem[]> {
  const q = new URLSearchParams({
    metric_date: params.metricDate,
    bucket_start: params.bucketStart,
  });
  if (
    params.minLat !== undefined &&
    params.minLon !== undefined &&
    params.maxLat !== undefined &&
    params.maxLon !== undefined
  ) {
    q.set("min_lat", String(params.minLat));
    q.set("min_lon", String(params.minLon));
    q.set("max_lat", String(params.maxLat));
    q.set("max_lon", String(params.maxLon));
  }
  const data = await request<{ items: HeatItem[] }>(`/map/heatmap?${q.toString()}`);
  return data.items ?? [];
}

export async function fetchRouteCapability(): Promise<RouteCapability> {
  return request<RouteCapability>("/route/capability");
}

export async function fetchRouteCompare(payload: RoutePayload): Promise<RouteResult> {
  return request<RouteResult>("/route/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
