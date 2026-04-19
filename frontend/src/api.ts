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
  query_bucket_start?: string | null;
};

export type SnappedPoint = {
  lat: number;
  lon: number;
  node_id: number;
  snap_distance_m: number;
};

export type RouteResult = {
  start_time?: string;
  query_time?: string;
  query_bucket_start?: string;
  nearest_start_node?: number;
  nearest_end_node?: number;
  route_start_node?: number;
  route_end_node?: number;
  snapped_start_point?: SnappedPoint;
  snapped_end_point?: SnappedPoint;
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
  graph_ready?: boolean;
  dynamic_speed_ready?: boolean;
  route_compare_ready?: boolean;
  pgrouting_available: boolean;
  road_segments_ready: boolean;
  edge_count: number;
  stats_initialized: boolean;
  speed_bins_ready: boolean;
  speed_bins_count: number;
  issues: string[];
};

export type MetaAsset = {
  asset_key: string;
  display_name: string;
  asset_layer: string;
  asset_type: string;
  source_table: string;
  status: string;
  row_count: number;
  refreshed_at?: string | null;
  description?: string | null;
};

export type MetaDates = {
  summary_dates: string[];
  heatmap_dates: string[];
  route_dates: string[];
  default_summary_date?: string | null;
  default_heatmap_date?: string | null;
  default_route_date?: string | null;
  refreshed_at?: string | null;
};

export type MetaPortalLayerSummary = {
  asset_layer: string;
  asset_count: number;
  ready_count: number;
  total_rows: number;
  completion_rate: number;
  refreshed_at?: string | null;
};

export type MetaPortalSummary = {
  total_asset_count: number;
  total_ready_count: number;
  total_rows: number;
  refreshed_at?: string | null;
  items: MetaPortalLayerSummary[];
};

export type MetaJob = {
  job_name: string;
  latest_run_id?: number | null;
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  message?: string | null;
  details?: Record<string, unknown>;
};

export type CrowdTagSummary = {
  tag_code: string;
  tag_name: string;
  vehicle_count: number;
  avg_trip_count?: number | null;
  avg_trip_distance_m?: number | null;
  avg_speed_kmh?: number | null;
  updated_at?: string | null;
};

export type CrowdProfileSummary = {
  total_vehicle_count: number;
  tagged_vehicle_count: number;
  tag_count: number;
  updated_at?: string | null;
  items: CrowdTagSummary[];
};

export type CrowdVehicle = {
  vehicle_id: string;
  active_days: number;
  trip_count: number;
  total_distance_m: number;
  avg_trip_distance_m?: number | null;
  avg_speed_kmh?: number | null;
  dominant_start_hour?: number | null;
  tags: string[];
};

export type CrowdSegment = {
  tag_code: string;
  tag_name?: string | null;
  road_id?: string | null;
  road_name?: string | null;
  trip_count: number;
  vehicle_count: number;
  distance_m: number;
  avg_speed_kmh?: number | null;
  geometry?: string | null;
  updated_at?: string | null;
};

export type RouteRecommendation = {
  start_time: string;
  query_time: string;
  query_bucket_start: string;
  recommended_strategy: string;
  used_dynamic_speed: boolean;
  fallback_mode: string;
  summary: string;
  reasons: string[];
  time_saved_s: number;
  distance_delta_m: number;
  recommended_route: RouteData;
  alternative_route: RouteData;
  shortest_route: RouteData;
  fastest_route: RouteData;
};

export type DepartureWindowOption = {
  start_time: string;
  query_bucket_start: string;
  recommended_strategy: string;
  estimated_time_s: number;
  used_dynamic_speed: boolean;
  score: number;
  summary: string;
};

export type DepartureWindowRecommendation = {
  travel_date: string;
  recommended_start_time: string;
  recommended_query_bucket_start: string;
  summary: string;
  options: DepartureWindowOption[];
};

export type CongestionAvoidanceRecommendation = {
  current_query_time: string;
  current_bucket_start: string;
  current_network_level?: string | null;
  recommended_action: string;
  recommended_query_time: string;
  recommended_strategy: string;
  summary: string;
  reasons: string[];
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

export async function fetchMetaHeatmapBuckets(metricDate: string): Promise<string[]> {
  const data = await request<{ items: string[] }>(
    `/meta/heatmap-buckets?metric_date=${encodeURIComponent(metricDate)}`
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

export async function fetchMetaAssets(): Promise<MetaAsset[]> {
  const data = await request<{ items: MetaAsset[] }>("/meta/assets");
  return data.items ?? [];
}

export async function fetchMetaDates(): Promise<MetaDates> {
  return request<MetaDates>("/meta/dates");
}

export async function fetchMetaPortalSummary(): Promise<MetaPortalSummary> {
  return request<MetaPortalSummary>("/meta/portal-summary");
}

export async function fetchLatestJobStatus(): Promise<MetaJob | null> {
  const data = await request<{ item: MetaJob | null }>("/meta/jobs/latest");
  return data.item ?? null;
}

export async function fetchCrowdProfileSummary(): Promise<CrowdProfileSummary> {
  return request<CrowdProfileSummary>("/crowd/profile-summary");
}

export async function fetchCrowdVehicles(tagCode?: string): Promise<CrowdVehicle[]> {
  const q = new URLSearchParams();
  if (tagCode) q.set("tag_code", tagCode);
  q.set("limit", "12");
  const data = await request<{ items: CrowdVehicle[] }>(`/crowd/vehicles?${q.toString()}`);
  return data.items ?? [];
}

export async function fetchCrowdSegments(tagCode?: string): Promise<CrowdSegment[]> {
  const q = new URLSearchParams();
  if (tagCode) q.set("tag_code", tagCode);
  q.set("limit", "8");
  const data = await request<{ items: CrowdSegment[] }>(`/crowd/segments?${q.toString()}`);
  return data.items ?? [];
}

export async function fetchRouteRecommendation(
  payload: RoutePayload
): Promise<RouteRecommendation> {
  return request<RouteRecommendation>("/recommend/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchDepartureWindowRecommendation(params: {
  travelDate: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  windowStartHour?: number;
  windowEndHour?: number;
  stepMinutes?: number;
}): Promise<DepartureWindowRecommendation> {
  const q = new URLSearchParams({
    travel_date: params.travelDate,
    start_lat: String(params.startLat),
    start_lon: String(params.startLon),
    end_lat: String(params.endLat),
    end_lon: String(params.endLon),
    window_start_hour: String(params.windowStartHour ?? 7),
    window_end_hour: String(params.windowEndHour ?? 10),
    step_minutes: String(params.stepMinutes ?? 15),
  });
  return request<DepartureWindowRecommendation>(
    `/recommend/departure-window?${q.toString()}`
  );
}

export async function fetchCongestionAvoidanceRecommendation(params: {
  startTime: string;
  queryTime: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
}): Promise<CongestionAvoidanceRecommendation> {
  const q = new URLSearchParams({
    start_time: params.startTime,
    query_time: params.queryTime,
    start_lat: String(params.startLat),
    start_lon: String(params.startLon),
    end_lat: String(params.endLat),
    end_lon: String(params.endLon),
  });
  return request<CongestionAvoidanceRecommendation>(
    `/recommend/congestion-avoidance?${q.toString()}`
  );
}

export async function fetchRouteCompare(payload: RoutePayload): Promise<RouteResult> {
  return request<RouteResult>("/route/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
