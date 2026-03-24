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
