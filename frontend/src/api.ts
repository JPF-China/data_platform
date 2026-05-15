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

// ── ops profile ──

export type VehicleProfile = {
  vehicle_id: string;
  first_trip_date: string | null;
  last_trip_date: string | null;
  active_days: number;
  trip_count: number;
  total_distance_m: number;
  avg_trip_distance_m: number | null;
  avg_speed_kmh: number | null;
  morning_trip_count: number;
  night_trip_count: number;
  peak_trip_count: number;
  short_trip_count: number;
  long_trip_count: number;
  dominant_start_hour: number | null;
};

export type VehicleTag = {
  vehicle_id: string;
  tag_code: string;
  tag_name: string;
  tag_score: number | null;
};

export type FrequentRoute = {
  vehicle_id: string;
  road_id: string;
  road_name: string | null;
  usage_count: number;
  total_distance_m: number;
  is_top3: boolean;
};

export type ActivityRankingItem = {
  rank_num: number;
  vehicle_id: string;
  trip_count: number;
  total_distance_m: number;
  active_days: number;
  avg_daily_trips: number | null;
  avg_speed_kmh: number | null;
  dominant_hour: number | null;
  rank_category: string;
};

export async function fetchVehicleProfiles(limit = 50, tag?: string, vehicleId?: string): Promise<{ profiles: VehicleProfile[]; tags: VehicleTag[]; total_vehicles: number; total_tags: number }> {
  let url = '/ops/vehicle-profiles?limit=' + limit;
  if (tag) url += '&tag=' + encodeURIComponent(tag);
  if (vehicleId) url += '&vehicle_id=' + encodeURIComponent(vehicleId);
  const data = await request<{ items: VehicleProfile[]; tags: VehicleTag[]; total_vehicles: number; total_tags: number }>(url);
  return { profiles: data.items ?? [], tags: data.tags ?? [], total_vehicles: data.total_vehicles ?? 0, total_tags: data.total_tags ?? 0 };
}

export async function fetchFrequentRoutes(limit = 50): Promise<FrequentRoute[]> {
  const data = await request<{ items: FrequentRoute[] }>(`/ops/frequent-routes?limit=${limit}`);
  return data.items ?? [];
}

export async function fetchActivityRanking(category = "trip_count", limit = 30): Promise<ActivityRankingItem[]> {
  const data = await request<{ items: ActivityRankingItem[] }>(
    `/ops/activity-ranking?category=${category}&limit=${limit}`
  );
  return data.items ?? [];
}

// ── risk monitoring ──

export type FatigueRecord = {
  vehicle_id: string;
  window_start: string;
  window_end: string;
  run_minutes: number;
  fatigue_level: string;
  threshold_minutes: number;
  severe_threshold_minutes: number;
};

export type AbnormalRecord = {
  vehicle_id: string;
  event_date: string;
  single_trip_duration_min: number;
  single_trip_distance_m: number;
  risk_level: string;
};

export type RiskSummaryRow = {
  summary_date: string;
  total_drivers: number;
  fatigue_drivers: number;
  severe_fatigue_drivers: number;
  abnormal_running_events: number;
  night_risk_drivers: number;
  overall_risk_level: string | null;
};

export async function fetchFatigue(limit = 100): Promise<FatigueRecord[]> {
  const data = await request<{ items: FatigueRecord[] }>(`/risk/fatigue?limit=${limit}`);
  return data.items ?? [];
}

export async function fetchAbnormal(limit = 100): Promise<AbnormalRecord[]> {
  const data = await request<{ items: AbnormalRecord[] }>(`/risk/abnormal?limit=${limit}`);
  return data.items ?? [];
}

export async function fetchRiskSummary(): Promise<RiskSummaryRow[]> {
  const data = await request<{ items: RiskSummaryRow[] }>("/risk/summary");
  return data.items ?? [];
}

// ── reporting ──

export type DailyReportRow = {
  report_date: string;
  total_trips: number;
  total_vehicles: number;
  total_distance_km: number;
  avg_trip_distance_m: number | null;
  avg_speed_kmh: number | null;
  peak_hour_trip_ratio: number | null;
  night_trip_ratio: number | null;
  fatigue_count: number;
  severe_fatigue_count: number;
  peak_vehicles: number;
  night_vehicles: number;
};

export type WeeklyReportRow = {
  week_start: string;
  week_end: string;
  total_trips: number;
  total_vehicles: number;
  total_distance_km: number;
  avg_daily_trips: number | null;
  avg_trip_distance_m: number | null;
  fatigue_events: number;
  severe_fatigue_events: number;
  abnormal_events: number;
  night_risk_drivers: number;
};

export async function fetchDailyReport(limit = 30): Promise<DailyReportRow[]> {
  const data = await request<{ items: DailyReportRow[] }>(`/report/daily?limit=${limit}`);
  return data.items ?? [];
}

export async function fetchWeeklyReport(limit = 12): Promise<WeeklyReportRow[]> {
  const data = await request<{ items: WeeklyReportRow[] }>(`/report/weekly?limit=${limit}`);
  return data.items ?? [];
}

// ── governance ──

export type AssetRecord = {
  asset_key: string;
  display_name: string;
  asset_layer: string;
  asset_type: string;
  status: string;
  row_count: number;
  refreshed_at: string | null;
};

export type QualityRecord = {
  check_key: string;
  status: string;
  checked_at: string | null;
  details: Record<string, unknown>;
};

export async function fetchAssets(): Promise<AssetRecord[]> {
  const data = await request<{ items: AssetRecord[] }>("/governance/assets");
  return data.items ?? [];
}

export async function fetchQualityChecks(): Promise<QualityRecord[]> {
  const data = await request<{ items: QualityRecord[] }>("/governance/quality");
  return data.items ?? [];
}

// ── vehicle path heatmap ──

export type VehiclePathSegment = {
  road_id: string | null;
  road_name: string | null;
  avg_speed_kmh: number | null;
  start_time: string;
  end_time: string;
  distance_m: number;
  geometry: string;
};

export async function fetchVehiclePath(vehicleId: string, metricDate?: string): Promise<VehiclePathSegment[]> {
  let url = '/map/vehicle-path?vehicle_id=' + encodeURIComponent(vehicleId);
  if (metricDate) url += '&metric_date=' + encodeURIComponent(metricDate);
  const data = await request<{ items: VehiclePathSegment[] }>(url);
  return data.items ?? [];
}
