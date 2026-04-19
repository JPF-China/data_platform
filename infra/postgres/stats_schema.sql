CREATE TABLE IF NOT EXISTS daily_metrics (
  metric_date date PRIMARY KEY,
  trip_count integer NOT NULL,
  vehicle_count integer NOT NULL,
  distance_m double precision NOT NULL,
  distance_km double precision NOT NULL,
  avg_trip_distance_m double precision,
  median_trip_distance_m double precision,
  avg_speed_kmh double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_distance_boxplot (
  metric_date date PRIMARY KEY,
  min_value double precision,
  q1_value double precision,
  median_value double precision,
  q3_value double precision,
  max_value double precision,
  sample_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_speed_boxplot (
  metric_date date PRIMARY KEY,
  min_value double precision,
  q1_value double precision,
  median_value double precision,
  q3_value double precision,
  max_value double precision,
  sample_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS heatmap_bins (
  id bigserial PRIMARY KEY,
  metric_date date NOT NULL,
  time_bucket_start timestamp NOT NULL,
  time_bucket_end timestamp NOT NULL,
  road_id text,
  road_name text,
  trip_count integer NOT NULL,
  vehicle_count integer NOT NULL,
  flow_count integer NOT NULL,
  distance_m double precision NOT NULL,
  geom geometry(MultiLineString, 4326)
);

CREATE TABLE IF NOT EXISTS table_row_stats (
  table_name text PRIMARY KEY,
  row_count bigint NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_asset_catalog (
  asset_key text PRIMARY KEY,
  display_name text NOT NULL,
  asset_layer text NOT NULL,
  asset_type text NOT NULL,
  source_table text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  row_count bigint NOT NULL DEFAULT 0,
  refreshed_at timestamptz,
  description text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS meta_available_time_range (
  asset_key text PRIMARY KEY,
  min_date date,
  max_date date,
  available_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_job_status (
  job_name text PRIMARY KEY,
  latest_run_id bigint REFERENCES ingest_runs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unknown',
  started_at timestamptz,
  finished_at timestamptz,
  message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_data_quality_check (
  check_key text PRIMARY KEY,
  status text NOT NULL DEFAULT 'unknown',
  checked_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS tdm_vehicle_profile (
  vehicle_id text PRIMARY KEY,
  first_trip_date date,
  last_trip_date date,
  active_days integer NOT NULL DEFAULT 0,
  trip_count integer NOT NULL DEFAULT 0,
  total_distance_m double precision NOT NULL DEFAULT 0,
  avg_trip_distance_m double precision,
  avg_speed_kmh double precision,
  morning_trip_count integer NOT NULL DEFAULT 0,
  night_trip_count integer NOT NULL DEFAULT 0,
  peak_trip_count integer NOT NULL DEFAULT 0,
  short_trip_count integer NOT NULL DEFAULT 0,
  long_trip_count integer NOT NULL DEFAULT 0,
  dominant_start_hour integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tdm_vehicle_tag (
  vehicle_id text NOT NULL REFERENCES tdm_vehicle_profile(vehicle_id) ON DELETE CASCADE,
  tag_code text NOT NULL,
  tag_name text NOT NULL,
  tag_type text NOT NULL DEFAULT 'statistical',
  tag_score double precision,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vehicle_id, tag_code)
);

CREATE TABLE IF NOT EXISTS tdm_road_profile (
  road_id text PRIMARY KEY,
  road_name text,
  active_days integer NOT NULL DEFAULT 0,
  bucket_count integer NOT NULL DEFAULT 0,
  trip_count integer NOT NULL DEFAULT 0,
  vehicle_count integer NOT NULL DEFAULT 0,
  flow_count integer NOT NULL DEFAULT 0,
  total_distance_m double precision NOT NULL DEFAULT 0,
  median_speed_kmh double precision,
  peak_bucket_count integer NOT NULL DEFAULT 0,
  congestion_bucket_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ads_vehicle_tag_summary (
  tag_code text PRIMARY KEY,
  tag_name text NOT NULL,
  vehicle_count integer NOT NULL DEFAULT 0,
  avg_trip_count double precision,
  avg_trip_distance_m double precision,
  avg_speed_kmh double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ads_vehicle_segments (
  tag_code text NOT NULL,
  road_id text NOT NULL,
  tag_name text NOT NULL,
  road_name text,
  trip_count integer NOT NULL DEFAULT 0,
  vehicle_count integer NOT NULL DEFAULT 0,
  distance_m double precision NOT NULL DEFAULT 0,
  avg_speed_kmh double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_code, road_id)
);

CREATE TABLE IF NOT EXISTS ads_asset_portal_summary (
  asset_layer text PRIMARY KEY,
  asset_count integer NOT NULL DEFAULT 0,
  ready_count integer NOT NULL DEFAULT 0,
  total_rows bigint NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ads_route_strategy (
  strategy_date date NOT NULL,
  bucket_start timestamp NOT NULL,
  bucket_end timestamp NOT NULL,
  road_count integer NOT NULL DEFAULT 0,
  congested_road_count integer NOT NULL DEFAULT 0,
  avg_speed_kmh double precision,
  congestion_ratio double precision,
  recommendation_level text NOT NULL DEFAULT 'balanced',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_start)
);

CREATE TABLE IF NOT EXISTS ads_route_recommendation (
  id bigserial PRIMARY KEY,
  recommendation_type text NOT NULL,
  travel_date date,
  query_time timestamp NOT NULL,
  query_bucket_start timestamp,
  start_point geometry(Point, 4326),
  end_point geometry(Point, 4326),
  recommended_strategy text,
  summary text,
  explanation jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  audit_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS road_speed_bins (
  id bigserial PRIMARY KEY,
  road_id text NOT NULL,
  bucket_start timestamp NOT NULL,
  bucket_end timestamp NOT NULL,
  median_speed_kmh double precision,
  mean_speed_kmh double precision,
  sample_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (road_id, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_heatmap_date_time ON heatmap_bins(metric_date, time_bucket_start);
CREATE INDEX IF NOT EXISTS idx_heatmap_geom ON heatmap_bins USING gist(geom);
CREATE INDEX IF NOT EXISTS idx_road_speed_bins_bucket ON road_speed_bins(bucket_start, road_id);
CREATE INDEX IF NOT EXISTS idx_road_speed_bins_road ON road_speed_bins(road_id, bucket_start);
CREATE INDEX IF NOT EXISTS idx_meta_asset_catalog_status ON meta_asset_catalog(status, asset_layer);
CREATE INDEX IF NOT EXISTS idx_meta_job_status_updated ON meta_job_status(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tdm_vehicle_profile_trip_count ON tdm_vehicle_profile(trip_count DESC, total_distance_m DESC);
CREATE INDEX IF NOT EXISTS idx_tdm_vehicle_tag_tag_code ON tdm_vehicle_tag(tag_code, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_tdm_road_profile_trip_count ON tdm_road_profile(trip_count DESC, total_distance_m DESC);
CREATE INDEX IF NOT EXISTS idx_ads_vehicle_segments_tag_code ON ads_vehicle_segments(tag_code, trip_count DESC);
CREATE INDEX IF NOT EXISTS idx_ads_route_strategy_date ON ads_route_strategy(strategy_date, recommendation_level, bucket_start);
CREATE INDEX IF NOT EXISTS idx_ads_route_recommendation_type_date ON ads_route_recommendation(recommendation_type, travel_date, created_at DESC);
