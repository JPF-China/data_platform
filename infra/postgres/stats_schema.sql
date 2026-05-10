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

CREATE TABLE IF NOT EXISTS ads_asset_portal_summary (
  asset_layer text PRIMARY KEY,
  asset_count integer NOT NULL DEFAULT 0,
  ready_count integer NOT NULL DEFAULT 0,
  total_rows bigint NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_vehicle_profile (
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

CREATE TABLE IF NOT EXISTS ops_vehicle_tag (
  vehicle_id text NOT NULL REFERENCES ops_vehicle_profile(vehicle_id) ON DELETE CASCADE,
  tag_code text NOT NULL,
  tag_name text NOT NULL,
  tag_type text NOT NULL DEFAULT 'statistical',
  tag_score double precision,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vehicle_id, tag_code)
);

CREATE TABLE IF NOT EXISTS ops_vehicle_tag_summary (
  tag_code text PRIMARY KEY,
  tag_name text NOT NULL,
  vehicle_count integer NOT NULL DEFAULT 0,
  avg_trip_count double precision,
  avg_trip_distance_m double precision,
  avg_speed_kmh double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_vehicle_profile_trip_count
ON ops_vehicle_profile(trip_count DESC, total_distance_m DESC, vehicle_id);

CREATE INDEX IF NOT EXISTS idx_ops_vehicle_tag_vehicle
ON ops_vehicle_tag(vehicle_id, tag_code);

CREATE OR REPLACE FUNCTION ops_refresh_vehicle_profile()
RETURNS void AS $$
BEGIN
  TRUNCATE ops_vehicle_tag, ops_vehicle_tag_summary, ops_vehicle_profile;
  INSERT INTO ops_vehicle_profile (
    vehicle_id,
    first_trip_date,
    last_trip_date,
    active_days,
    trip_count,
    total_distance_m,
    avg_trip_distance_m,
    avg_speed_kmh,
    morning_trip_count,
    night_trip_count,
    peak_trip_count,
    short_trip_count,
    long_trip_count,
    dominant_start_hour,
    updated_at
  )
  WITH trip_distance AS (
    SELECT
      s.trip_id,
      COALESCE(SUM(s.distance_m), 0) AS trip_distance_m,
      AVG(s.avg_speed_kmh) FILTER (WHERE s.avg_speed_kmh IS NOT NULL) AS trip_avg_speed_kmh
    FROM trip_segments s
    GROUP BY s.trip_id
  ),
  trip_feature AS (
    SELECT
      t.devid AS vehicle_id,
      t.trip_date,
      t.start_time,
      COALESCE(td.trip_distance_m, 0) AS trip_distance_m,
      td.trip_avg_speed_kmh,
      CASE
        WHEN t.start_time IS NOT NULL
          AND EXTRACT(HOUR FROM t.start_time) BETWEEN 6 AND 9
        THEN 1 ELSE 0
      END AS morning_trip,
      CASE
        WHEN t.start_time IS NOT NULL
         AND (
           EXTRACT(HOUR FROM t.start_time) BETWEEN 7 AND 9
           OR EXTRACT(HOUR FROM t.start_time) BETWEEN 17 AND 20
         )
        THEN 1 ELSE 0
      END AS peak_trip,
      CASE
        WHEN t.start_time IS NOT NULL
         AND (
           EXTRACT(HOUR FROM t.start_time) >= 21
           OR EXTRACT(HOUR FROM t.start_time) < 6
         )
        THEN 1 ELSE 0
      END AS night_trip,
      CASE WHEN COALESCE(td.trip_distance_m, 0) < 5000 THEN 1 ELSE 0 END AS short_trip,
      CASE WHEN COALESCE(td.trip_distance_m, 0) >= 8000 THEN 1 ELSE 0 END AS long_trip,
      EXTRACT(HOUR FROM t.start_time)::int AS start_hour
    FROM trips t
    LEFT JOIN trip_distance td ON td.trip_id = t.id
    WHERE t.devid IS NOT NULL
      AND t.is_valid = true
  ),
  dominant_hour_counts AS (
    SELECT
      vehicle_id,
      start_hour,
      COUNT(*) AS hour_freq
    FROM trip_feature
    WHERE start_hour IS NOT NULL
    GROUP BY vehicle_id, start_hour
  ),
  dominant_hour AS (
    SELECT DISTINCT ON (vehicle_id)
      vehicle_id,
      start_hour AS dominant_start_hour
    FROM dominant_hour_counts
    ORDER BY vehicle_id, hour_freq DESC, start_hour
  )
  SELECT
    tf.vehicle_id,
    MIN(trip_date) AS first_trip_date,
    MAX(trip_date) AS last_trip_date,
    COUNT(DISTINCT trip_date) AS active_days,
    COUNT(*) AS trip_count,
    SUM(trip_distance_m) AS total_distance_m,
    AVG(trip_distance_m) AS avg_trip_distance_m,
    AVG(trip_avg_speed_kmh) AS avg_speed_kmh,
    SUM(morning_trip) AS morning_trip_count,
    SUM(night_trip) AS night_trip_count,
    SUM(peak_trip) AS peak_trip_count,
    SUM(short_trip) AS short_trip_count,
    SUM(long_trip) AS long_trip_count,
    dh.dominant_start_hour,
    now()
  FROM trip_feature tf
  LEFT JOIN dominant_hour dh ON dh.vehicle_id = tf.vehicle_id
  GROUP BY tf.vehicle_id, dh.dominant_start_hour;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ops_refresh_vehicle_tags()
RETURNS void AS $$
BEGIN
  TRUNCATE ops_vehicle_tag;
  INSERT INTO ops_vehicle_tag (
    vehicle_id,
    tag_code,
    tag_name,
    tag_type,
    tag_score,
    evidence,
    updated_at
  )
  SELECT
    vehicle_id,
    'commuter' AS tag_code,
    'High Peak' AS tag_name,
    'statistical' AS tag_type,
    LEAST(1.0, (peak_trip_count::double precision / GREATEST(trip_count, 1))) AS tag_score,
    jsonb_build_object('peak_trip_count', peak_trip_count, 'trip_count', trip_count),
    now()
  FROM ops_vehicle_profile
  WHERE peak_trip_count >= 2
  UNION ALL
  SELECT
    vehicle_id,
    'night_active' AS tag_code,
    'Night Active' AS tag_name,
    'statistical' AS tag_type,
    LEAST(1.0, (night_trip_count::double precision / GREATEST(trip_count, 1))) AS tag_score,
    jsonb_build_object('night_trip_count', night_trip_count, 'trip_count', trip_count),
    now()
  FROM ops_vehicle_profile
  WHERE night_trip_count >= 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ops_refresh_vehicle_tag_summary()
RETURNS void AS $$
BEGIN
  TRUNCATE ops_vehicle_tag_summary;
  INSERT INTO ops_vehicle_tag_summary (
    tag_code,
    tag_name,
    vehicle_count,
    avg_trip_count,
    avg_trip_distance_m,
    avg_speed_kmh,
    updated_at
  )
  SELECT
    t.tag_code,
    t.tag_name,
    COUNT(*) AS vehicle_count,
    AVG(p.trip_count) AS avg_trip_count,
    AVG(p.avg_trip_distance_m) AS avg_trip_distance_m,
    AVG(p.avg_speed_kmh) AS avg_speed_kmh,
    now()
  FROM ops_vehicle_tag t
  JOIN ops_vehicle_profile p ON p.vehicle_id = t.vehicle_id
  GROUP BY t.tag_code, t.tag_name;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS risk_driver_fatigue (
  driver_id text NOT NULL,
  window_start timestamp NOT NULL,
  window_end timestamp NOT NULL,
  run_minutes integer NOT NULL,
  fatigue_level text NOT NULL,
  threshold_minutes integer NOT NULL,
  severe_threshold_minutes integer NOT NULL DEFAULT 840,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (driver_id, window_start)
);

CREATE TABLE IF NOT EXISTS risk_driver_fatigue_event (
  id bigserial PRIMARY KEY,
  driver_id text NOT NULL,
  event_time timestamp NOT NULL,
  fatigue_level text NOT NULL,
  run_minutes integer NOT NULL,
  threshold_minutes integer NOT NULL,
  severe_threshold_minutes integer NOT NULL DEFAULT 840,
  source_window_start timestamp NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_fatigue_driver_time
ON risk_driver_fatigue(driver_id, window_start DESC);

CREATE INDEX IF NOT EXISTS idx_risk_fatigue_event_driver_time
ON risk_driver_fatigue_event(driver_id, event_time DESC);

CREATE OR REPLACE FUNCTION risk_refresh_driver_fatigue()
RETURNS void AS $$
BEGIN
  TRUNCATE risk_driver_fatigue;
  TRUNCATE risk_driver_fatigue_event;

  WITH segment_runs AS (
    SELECT
      t.devid AS driver_id,
      s.start_time,
      s.end_time,
      GREATEST(0, EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60.0) AS run_minutes
    FROM trips t
    JOIN trip_segments s ON s.trip_id = t.id
    WHERE t.devid IS NOT NULL
      AND t.is_valid = true
      AND s.start_time IS NOT NULL
      AND s.end_time IS NOT NULL
  ),
  driver_activity AS (
    SELECT
      driver_id,
      MIN(start_time) AS first_time,
      MAX(end_time) AS last_time
    FROM segment_runs
    GROUP BY driver_id
  ),
  driver_windows AS (
    SELECT
      driver_id,
      first_time AS window_start,
      first_time + INTERVAL '24 hour' AS window_end
    FROM driver_activity
  ),
  window_runs AS (
    SELECT
      w.driver_id,
      w.window_start,
      w.window_end,
      COALESCE(SUM(r.run_minutes), 0) AS run_minutes
    FROM driver_windows w
    LEFT JOIN segment_runs r
      ON r.driver_id = w.driver_id
     AND r.start_time < w.window_end
     AND r.end_time > w.window_start
    GROUP BY w.driver_id, w.window_start, w.window_end
  )
  INSERT INTO risk_driver_fatigue (
    driver_id,
    window_start,
    window_end,
    run_minutes,
    fatigue_level,
    threshold_minutes,
    severe_threshold_minutes,
    updated_at
  )
  SELECT
    driver_id,
    window_start,
    window_end,
    ROUND(run_minutes)::int,
    CASE
      WHEN run_minutes >= 840 THEN 'severe'
      WHEN run_minutes >= 720 THEN 'fatigue'
      ELSE 'normal'
    END AS fatigue_level,
    720,
    840,
    now()
  FROM window_runs;

  INSERT INTO risk_driver_fatigue_event (
    driver_id,
    event_time,
    fatigue_level,
    run_minutes,
    threshold_minutes,
    severe_threshold_minutes,
    source_window_start,
    created_at
  )
  SELECT
    driver_id,
    window_end AS event_time,
    fatigue_level,
    run_minutes,
    threshold_minutes,
    severe_threshold_minutes,
    window_start,
    now()
  FROM risk_driver_fatigue
  WHERE fatigue_level IN ('fatigue', 'severe');
END;
$$ LANGUAGE plpgsql;

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

-- ========== stat aggregation extended ==========

CREATE TABLE IF NOT EXISTS hourly_metrics (
  id bigserial PRIMARY KEY,
  metric_date date NOT NULL,
  hour_bucket integer NOT NULL CHECK (hour_bucket >= 0 AND hour_bucket <= 23),
  trip_count integer NOT NULL DEFAULT 0,
  vehicle_count integer NOT NULL DEFAULT 0,
  distance_m double precision NOT NULL DEFAULT 0,
  avg_speed_kmh double precision,
  peak_flag boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_date, hour_bucket)
);

CREATE TABLE IF NOT EXISTS road_daily_stats (
  id bigserial PRIMARY KEY,
  metric_date date NOT NULL,
  road_id text NOT NULL,
  road_name text,
  trip_count integer NOT NULL DEFAULT 0,
  vehicle_count integer NOT NULL DEFAULT 0,
  total_distance_m double precision NOT NULL DEFAULT 0,
  avg_speed_kmh double precision,
  peak_hour integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_date, road_id)
);

CREATE INDEX IF NOT EXISTS idx_hourly_metrics_date ON hourly_metrics(metric_date, hour_bucket);
CREATE INDEX IF NOT EXISTS idx_road_daily_stats_date ON road_daily_stats(metric_date, road_id);

CREATE OR REPLACE FUNCTION stats_refresh_hourly_metrics()
RETURNS void AS $$
BEGIN
  TRUNCATE hourly_metrics;
  INSERT INTO hourly_metrics (
    metric_date, hour_bucket, trip_count, vehicle_count, distance_m,
    avg_speed_kmh, peak_flag, updated_at
  )
  SELECT
    t.trip_date AS metric_date,
    EXTRACT(HOUR FROM t.start_time)::integer AS hour_bucket,
    COUNT(DISTINCT t.id) AS trip_count,
    COUNT(DISTINCT t.devid) AS vehicle_count,
    COALESCE(SUM(sd.distance_m), 0) AS distance_m,
    AVG(sd.avg_speed_kmh) FILTER (WHERE sd.avg_speed_kmh IS NOT NULL) AS avg_speed_kmh,
    BOOL_OR(
      EXTRACT(HOUR FROM t.start_time)::integer IN (7, 8, 9, 17, 18, 19)
    ) AS peak_flag,
    now()
  FROM trips t
  LEFT JOIN LATERAL (
    SELECT SUM(s.distance_m) AS distance_m,
           AVG(s.avg_speed_kmh) AS avg_speed_kmh
    FROM trip_segments s
    WHERE s.trip_id = t.id
  ) sd ON true
  WHERE t.is_valid = true
    AND t.start_time IS NOT NULL
    AND t.devid IS NOT NULL
  GROUP BY t.trip_date, EXTRACT(HOUR FROM t.start_time)::integer;
END;
$$ LANGUAGE plpgsql;

-- ========== route analysis ==========

CREATE TABLE IF NOT EXISTS route_comparisons (
  id bigserial PRIMARY KEY,
  query_id text NOT NULL,
  strategy_a text NOT NULL,
  strategy_b text NOT NULL,
  distance_m_a double precision NOT NULL,
  distance_m_b double precision NOT NULL,
  time_s_a double precision NOT NULL,
  time_s_b double precision NOT NULL,
  start_road_id text,
  end_road_id text,
  favor_strategy text GENERATED ALWAYS AS (
    CASE WHEN time_s_a <= time_s_b THEN strategy_a ELSE strategy_b END
  ) STORED,
  comparison_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS route_strategies (
  strategy_code text PRIMARY KEY,
  strategy_name text NOT NULL,
  description text,
  cost_column text NOT NULL DEFAULT 'cost',
  reverse_cost_column text NOT NULL DEFAULT 'reverse_cost',
  is_active boolean NOT NULL DEFAULT false,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_comparisons_query ON route_comparisons(query_id, created_at DESC);

-- ========== ops profile extended ==========

CREATE TABLE IF NOT EXISTS ops_frequent_route (
  id bigserial PRIMARY KEY,
  vehicle_id text NOT NULL,
  road_id text NOT NULL,
  road_name text,
  usage_count integer NOT NULL DEFAULT 0,
  total_distance_m double precision NOT NULL DEFAULT 0,
  first_used_date date,
  last_used_date date,
  is_top3 boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_activity_ranking (
  rank_num integer NOT NULL,
  vehicle_id text NOT NULL,
  trip_count integer NOT NULL DEFAULT 0,
  total_distance_m double precision NOT NULL DEFAULT 0,
  active_days integer NOT NULL DEFAULT 0,
  avg_daily_trips double precision,
  avg_speed_kmh double precision,
  dominant_hour integer,
  rank_category text NOT NULL DEFAULT 'trip_count',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rank_category, rank_num)
);

CREATE INDEX IF NOT EXISTS idx_frequent_route_vehicle ON ops_frequent_route(vehicle_id, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_activity_ranking_vehicle ON ops_activity_ranking(vehicle_id);

CREATE OR REPLACE FUNCTION ops_refresh_frequent_routes()
RETURNS void AS $$
BEGIN
  TRUNCATE ops_frequent_route;
  INSERT INTO ops_frequent_route (
    vehicle_id, road_id, road_name, usage_count, total_distance_m,
    first_used_date, last_used_date, is_top3, updated_at
  )
  WITH road_usage AS (
    SELECT
      t.devid AS vehicle_id,
      s.road_id,
      MAX(s.road_name) AS road_name,
      COUNT(*) AS usage_count,
      COALESCE(SUM(s.distance_m), 0) AS total_distance_m,
      MIN(t.trip_date) AS first_used_date,
      MAX(t.trip_date) AS last_used_date
    FROM trips t
    JOIN trip_segments s ON s.trip_id = t.id
    WHERE t.is_valid = true
      AND s.road_id IS NOT NULL
    GROUP BY t.devid, s.road_id
  ),
  ranked AS (
    SELECT
      *,
      ROW_NUMBER() OVER (PARTITION BY vehicle_id ORDER BY usage_count DESC) AS rank_n
    FROM road_usage
  )
  SELECT
    vehicle_id, road_id, road_name, usage_count, total_distance_m,
    first_used_date, last_used_date,
    (rank_n <= 3) AS is_top3,
    now()
  FROM ranked;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ops_refresh_activity_ranking()
RETURNS void AS $$
BEGIN
  TRUNCATE ops_activity_ranking;
  INSERT INTO ops_activity_ranking (
    rank_num, vehicle_id, trip_count, total_distance_m,
    active_days, avg_daily_trips, avg_speed_kmh,
    dominant_hour, rank_category, updated_at
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY trip_count DESC)::integer AS rank_num,
    vehicle_id, trip_count, total_distance_m,
    active_days,
    CASE WHEN active_days > 0
      THEN trip_count::double precision / active_days
      ELSE 0
    END AS avg_daily_trips,
    avg_speed_kmh,
    dominant_start_hour,
    'trip_count' AS rank_category,
    now()
  FROM ops_vehicle_profile
  WHERE trip_count > 0
  UNION ALL
  SELECT
    ROW_NUMBER() OVER (ORDER BY total_distance_m DESC)::integer AS rank_num,
    vehicle_id, trip_count, total_distance_m,
    active_days,
    CASE WHEN active_days > 0
      THEN trip_count::double precision / active_days
      ELSE 0
    END AS avg_daily_trips,
    avg_speed_kmh,
    dominant_start_hour,
    'distance' AS rank_category,
    now()
  FROM ops_vehicle_profile
  WHERE total_distance_m > 0;
END;
$$ LANGUAGE plpgsql;

-- ========== risk monitoring extended ==========

CREATE TABLE IF NOT EXISTS risk_abnormal_running (
  id bigserial PRIMARY KEY,
  driver_id text NOT NULL,
  event_date date NOT NULL,
  single_trip_duration_min integer NOT NULL,
  single_trip_distance_m double precision NOT NULL,
  trip_id bigint,
  risk_level text NOT NULL,
  threshold_hours double precision NOT NULL DEFAULT 3.0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_night_high_risk (
  id bigserial PRIMARY KEY,
  driver_id text NOT NULL,
  event_date date NOT NULL,
  night_distance_m double precision NOT NULL DEFAULT 0,
  night_duration_min integer NOT NULL DEFAULT 0,
  night_speed_kmh double precision,
  risk_level text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_summary (
  summary_date date PRIMARY KEY,
  total_drivers integer NOT NULL DEFAULT 0,
  fatigue_drivers integer NOT NULL DEFAULT 0,
  severe_fatigue_drivers integer NOT NULL DEFAULT 0,
  abnormal_running_events integer NOT NULL DEFAULT 0,
  night_risk_drivers integer NOT NULL DEFAULT 0,
  overall_risk_level text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abnormal_running_driver ON risk_abnormal_running(driver_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_night_risk_driver ON risk_night_high_risk(driver_id, event_date DESC);

CREATE OR REPLACE FUNCTION risk_refresh_abnormal_running()
RETURNS void AS $$
BEGIN
  TRUNCATE risk_abnormal_running;
  INSERT INTO risk_abnormal_running (
    driver_id, event_date, single_trip_duration_min,
    single_trip_distance_m, trip_id, risk_level,
    threshold_hours, details, created_at
  )
  WITH trip_duration AS (
    SELECT
      t.devid AS driver_id,
      t.id AS trip_id,
      t.trip_date AS event_date,
      EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 60.0 AS duration_min,
      COALESCE(SUM(s.distance_m), 0) AS trip_distance_m
    FROM trips t
    LEFT JOIN trip_segments s ON s.trip_id = t.id
    WHERE t.is_valid = true
      AND t.start_time IS NOT NULL
      AND t.end_time IS NOT NULL
      AND t.devid IS NOT NULL
    GROUP BY t.devid, t.id, t.trip_date, t.start_time, t.end_time
    HAVING EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 60.0 >= 180
  )
  SELECT
    driver_id, event_date,
    ROUND(duration_min)::integer,
    trip_distance_m, trip_id,
    CASE
      WHEN duration_min >= 480 THEN 'critical'
      WHEN duration_min >= 300 THEN 'high'
      ELSE 'moderate'
    END AS risk_level,
    3.0,
    jsonb_build_object('source_trip_id', trip_id),
    now()
  FROM trip_duration;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION risk_refresh_night_high_risk()
RETURNS void AS $$
BEGIN
  TRUNCATE risk_night_high_risk;
  INSERT INTO risk_night_high_risk (
    driver_id, event_date, night_distance_m, night_duration_min,
    night_speed_kmh, risk_level, details, created_at
  )
  WITH night_segments AS (
    SELECT
      t.devid AS driver_id,
      t.trip_date AS event_date,
      s.distance_m,
      EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60.0 AS duration_min,
      s.avg_speed_kmh
    FROM trips t
    JOIN trip_segments s ON s.trip_id = t.id
    WHERE t.is_valid = true
      AND t.devid IS NOT NULL
      AND s.start_time IS NOT NULL
      AND s.end_time IS NOT NULL
      AND (
        EXTRACT(HOUR FROM s.start_time) >= 22
        OR EXTRACT(HOUR FROM s.start_time) < 5
        OR EXTRACT(HOUR FROM s.end_time) >= 22
        OR EXTRACT(HOUR FROM s.end_time) < 5
      )
  ),
  night_agg AS (
    SELECT
      driver_id, event_date,
      COALESCE(SUM(distance_m), 0) AS night_distance_m,
      COALESCE(SUM(duration_min), 0)::integer AS night_duration_min,
      AVG(avg_speed_kmh) FILTER (WHERE avg_speed_kmh IS NOT NULL) AS night_speed_kmh
    FROM night_segments
    GROUP BY driver_id, event_date
  )
  SELECT
    driver_id, event_date, night_distance_m, night_duration_min,
    night_speed_kmh,
    CASE
      WHEN night_distance_m >= 50000 THEN 'high'
      WHEN night_distance_m >= 20000 THEN 'moderate'
      ELSE 'low'
    END AS risk_level,
    jsonb_build_object(
      'night_distance_m', night_distance_m,
      'night_duration_min', night_duration_min
    ),
    now()
  FROM night_agg;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION risk_refresh_summary()
RETURNS void AS $$
BEGIN
  TRUNCATE risk_summary;
  INSERT INTO risk_summary (
    summary_date, total_drivers, fatigue_drivers,
    severe_fatigue_drivers, abnormal_running_events,
    night_risk_drivers, overall_risk_level, updated_at
  )
  SELECT
    COALESCE(
      (SELECT MIN(trip_date) FROM trips WHERE is_valid = true),
      CURRENT_DATE
    ) AS summary_date,
    COALESCE((SELECT COUNT(DISTINCT devid) FROM trips WHERE is_valid = true), 0) AS total_drivers,
    COALESCE(
      (SELECT COUNT(DISTINCT driver_id) FROM risk_driver_fatigue WHERE fatigue_level = 'fatigue'),
      0
    ) AS fatigue_drivers,
    COALESCE(
      (SELECT COUNT(DISTINCT driver_id) FROM risk_driver_fatigue WHERE fatigue_level = 'severe'),
      0
    ) AS severe_fatigue_drivers,
    COALESCE((SELECT COUNT(*) FROM risk_abnormal_running), 0) AS abnormal_running_events,
    COALESCE((SELECT COUNT(DISTINCT driver_id) FROM risk_night_high_risk WHERE risk_level = 'high'), 0) AS night_risk_drivers,
    CASE
      WHEN COALESCE(
        (SELECT COUNT(DISTINCT driver_id) FROM risk_driver_fatigue WHERE fatigue_level = 'severe'), 0
      ) > 0 THEN 'critical'
      WHEN COALESCE(
        (SELECT COUNT(DISTINCT driver_id) FROM risk_driver_fatigue WHERE fatigue_level = 'fatigue'), 0
      ) > 0 THEN 'warning'
      ELSE 'normal'
    END,
    now();
END;
$$ LANGUAGE plpgsql;

-- ========== operations reporting ==========

CREATE TABLE IF NOT EXISTS report_daily_summary (
  report_date date PRIMARY KEY,
  total_trips integer NOT NULL DEFAULT 0,
  total_vehicles integer NOT NULL DEFAULT 0,
  total_distance_km double precision NOT NULL DEFAULT 0,
  avg_trip_distance_m double precision,
  avg_speed_kmh double precision,
  peak_hour_trip_ratio double precision,
  night_trip_ratio double precision,
  fatigue_count integer NOT NULL DEFAULT 0,
  severe_fatigue_count integer NOT NULL DEFAULT 0,
  peak_vehicles integer NOT NULL DEFAULT 0,
  night_vehicles integer NOT NULL DEFAULT 0,
  meta_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_weekly_summary (
  week_start date NOT NULL,
  week_end date NOT NULL,
  total_trips integer NOT NULL DEFAULT 0,
  total_vehicles integer NOT NULL DEFAULT 0,
  total_distance_km double precision NOT NULL DEFAULT 0,
  avg_daily_trips double precision,
  avg_trip_distance_m double precision,
  fatigue_events integer NOT NULL DEFAULT 0,
  severe_fatigue_events integer NOT NULL DEFAULT 0,
  abnormal_events integer NOT NULL DEFAULT 0,
  night_risk_drivers integer NOT NULL DEFAULT 0,
  meta_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, week_end)
);

CREATE OR REPLACE FUNCTION report_refresh_daily()
RETURNS void AS $$
BEGIN
  TRUNCATE report_daily_summary;
  INSERT INTO report_daily_summary (
    report_date, total_trips, total_vehicles, total_distance_km,
    avg_trip_distance_m, avg_speed_kmh,
    peak_hour_trip_ratio, night_trip_ratio,
    fatigue_count, severe_fatigue_count,
    peak_vehicles, night_vehicles,
    updated_at
  )
  SELECT
    dm.metric_date AS report_date,
    dm.trip_count AS total_trips,
    dm.vehicle_count AS total_vehicles,
    dm.distance_km AS total_distance_km,
    dm.avg_trip_distance_m,
    dm.avg_speed_kmh,
    CASE WHEN dm.trip_count > 0
      THEN COALESCE(
        (SELECT SUM(trip_count)::double precision
         FROM hourly_metrics hm
         WHERE hm.metric_date = dm.metric_date AND hm.peak_flag = true
        ) / dm.trip_count, 0)
      ELSE 0
    END AS peak_hour_trip_ratio,
    CASE WHEN dm.trip_count > 0
      THEN COALESCE(
        (SELECT SUM(trip_count)::double precision
         FROM hourly_metrics hm
         WHERE hm.metric_date = dm.metric_date AND hm.hour_bucket IN (21, 22, 23, 0, 1, 2, 3, 4, 5)
        ) / dm.trip_count, 0)
      ELSE 0
    END AS night_trip_ratio,
    COALESCE(
      (SELECT COUNT(DISTINCT driver_id)
       FROM risk_driver_fatigue f
       WHERE f.window_start::date = dm.metric_date AND f.fatigue_level = 'fatigue'),
      0
    ) AS fatigue_count,
    COALESCE(
      (SELECT COUNT(DISTINCT driver_id)
       FROM risk_driver_fatigue f
       WHERE f.window_start::date = dm.metric_date AND f.fatigue_level = 'severe'),
      0
    ) AS severe_fatigue_count,
    COALESCE(
      (SELECT COUNT(*)
       FROM ops_vehicle_profile vp
       WHERE vp.peak_trip_count > 0 AND vp.last_trip_date = dm.metric_date),
      0
    ) AS peak_vehicles,
    COALESCE(
      (SELECT COUNT(*)
       FROM ops_vehicle_profile vp
       WHERE vp.night_trip_count > 0 AND vp.last_trip_date = dm.metric_date),
      0
    ) AS night_vehicles,
    now()
  FROM daily_metrics dm;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION report_refresh_weekly()
RETURNS void AS $$
BEGIN
  TRUNCATE report_weekly_summary;
  INSERT INTO report_weekly_summary (
    week_start, week_end, total_trips, total_vehicles, total_distance_km,
    avg_daily_trips, avg_trip_distance_m, fatigue_events,
    severe_fatigue_events, abnormal_events, night_risk_drivers,
    updated_at
  )
  SELECT
    date_trunc('week', report_date)::date AS week_start,
    (date_trunc('week', report_date)::date + INTERVAL '6 days')::date AS week_end,
    SUM(total_trips)::integer,
    SUM(total_vehicles)::integer,
    SUM(total_distance_km),
    AVG(total_trips),
    AVG(avg_trip_distance_m),
    SUM(fatigue_count)::integer,
    SUM(severe_fatigue_count)::integer,
    0 AS abnormal_events,
    0 AS night_risk_drivers,
    now()
  FROM report_daily_summary
  GROUP BY date_trunc('week', report_date)::date;
END;
$$ LANGUAGE plpgsql;

-- ========== governance refresh functions ==========

CREATE OR REPLACE FUNCTION governance_refresh_assets()
RETURNS void AS $$
BEGIN
  DELETE FROM meta_asset_catalog;
  INSERT INTO meta_asset_catalog (
    asset_key, display_name, asset_layer, asset_type, source_table,
    status, row_count, refreshed_at, description, details
  )
  SELECT
    table_name,
    initcap(replace(table_name, '_', ' ')),
    CASE
      WHEN table_name LIKE 'trip%' OR table_name LIKE 'road_segments' OR table_name LIKE 'bfmap_ways%' THEN 'DWD'
      WHEN table_name LIKE 'daily_%' OR table_name LIKE 'hourly_%' OR table_name LIKE 'heatmap_%' OR table_name LIKE 'road_speed_%' OR table_name LIKE 'road_daily_%' THEN 'DWS'
      WHEN table_name LIKE 'ops_%' THEN 'DWS'
      WHEN table_name LIKE 'risk_%' THEN 'DWS'
      WHEN table_name LIKE 'meta_%' OR table_name LIKE 'ads_%' THEN 'ADS'
      WHEN table_name LIKE 'report_%' THEN 'ADS'
      WHEN table_name LIKE 'route_%' AND table_name NOT LIKE 'route_comparisons' THEN 'DWD'
      ELSE 'DWD'
    END,
    'table',
    table_name,
    'ready',
    COALESCE((SELECT reltuples::bigint FROM pg_class WHERE relname = table_name), 0),
    now(),
    'Auto-registered by governance_refresh_assets',
    jsonb_build_object('schema', table_schema)
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name NOT LIKE 'pg_%'
    AND table_name NOT LIKE 'sql_%'
    AND table_name NOT IN ('spatial_ref_sys', 'geography_columns', 'geometry_columns', 'bfmap_ways_import');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION governance_refresh_time_ranges()
RETURNS void AS $$
BEGIN
  DELETE FROM meta_available_time_range;
  INSERT INTO meta_available_time_range (
    asset_key, min_date, max_date, available_dates, updated_at
  )
  SELECT
    'trips' AS asset_key,
    MIN(trip_date) AS min_date,
    MAX(trip_date) AS max_date,
    COALESCE(
      (SELECT jsonb_agg(d ORDER BY d)
       FROM (SELECT DISTINCT trip_date AS d FROM trips WHERE is_valid = true) sub),
      '[]'::jsonb
    ),
    now()
  FROM trips
  WHERE is_valid = true;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION governance_refresh_job_status()
RETURNS void AS $$
DECLARE
  _latest_id bigint;
BEGIN
  SELECT MAX(id) INTO _latest_id FROM ingest_runs WHERE run_type = 'pipeline_ingest';

  INSERT INTO meta_job_status (job_name, latest_run_id, status, started_at, finished_at, message, updated_at)
  SELECT
    'ingest' AS job_name,
    _latest_id AS latest_run_id,
    COALESCE(status, 'unknown'),
    started_at,
    finished_at,
    error_message,
    now()
  FROM ingest_runs
  WHERE id = _latest_id
  ON CONFLICT (job_name) DO UPDATE
  SET latest_run_id = EXCLUDED.latest_run_id,
      status = EXCLUDED.status,
      started_at = EXCLUDED.started_at,
      finished_at = EXCLUDED.finished_at,
      message = EXCLUDED.message,
      updated_at = EXCLUDED.updated_at;

  INSERT INTO meta_job_status (job_name, status, updated_at)
  VALUES ('vehicle_profile_refresh', 'unknown', now())
  ON CONFLICT (job_name) DO NOTHING;

  INSERT INTO meta_job_status (job_name, status, updated_at)
  VALUES ('risk_refresh', 'unknown', now())
  ON CONFLICT (job_name) DO NOTHING;

  INSERT INTO meta_job_status (job_name, status, updated_at)
  VALUES ('report_refresh', 'unknown', now())
  ON CONFLICT (job_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION governance_refresh_quality_checks()
RETURNS void AS $$
BEGIN
  DELETE FROM meta_data_quality_check;

  INSERT INTO meta_data_quality_check (check_key, status, checked_at, details)
  SELECT
    'trip_completeness',
    CASE WHEN tc > 0 THEN 'pass' ELSE 'fail' END,
    now(),
    jsonb_build_object('total_trips', tc)
  FROM (SELECT COUNT(*) AS tc FROM trips) sub;

  INSERT INTO meta_data_quality_check (check_key, status, checked_at, details)
  SELECT
    'trip_has_segments',
    CASE WHEN cnt > 0 THEN 'pass' ELSE 'fail' END,
    now(),
    jsonb_build_object('trips_without_segments', cnt)
  FROM (
    SELECT COUNT(*) AS cnt
    FROM trips t
    WHERE t.is_valid = true
      AND NOT EXISTS (SELECT 1 FROM trip_segments s WHERE s.trip_id = t.id)
  ) sub;

  INSERT INTO meta_data_quality_check (check_key, status, checked_at, details)
  SELECT
    'date_range_available',
    CASE WHEN min_d IS NOT NULL THEN 'pass' ELSE 'fail' END,
    now(),
    jsonb_build_object('min_date', min_d, 'max_date', max_d)
  FROM (SELECT MIN(trip_date) AS min_d, MAX(trip_date) AS max_d FROM trips WHERE is_valid = true) sub;

  INSERT INTO meta_data_quality_check (check_key, status, checked_at, details)
  SELECT
    'daily_metrics_fresh',
    CASE WHEN cnt > 0 THEN 'pass' ELSE 'fail' END,
    now(),
    jsonb_build_object('daily_metrics_count', cnt)
  FROM (SELECT COUNT(*) AS cnt FROM daily_metrics) sub;

  INSERT INTO meta_data_quality_check (check_key, status, checked_at, details)
  SELECT
    'heatmap_bins_fresh',
    CASE WHEN cnt > 0 THEN 'pass' ELSE 'fail' END,
    now(),
    jsonb_build_object('heatmap_bins_count', cnt)
  FROM (SELECT COUNT(*) AS cnt FROM heatmap_bins) sub;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION governance_refresh_portal_summary()
RETURNS void AS $$
BEGIN
  TRUNCATE ads_asset_portal_summary;
  INSERT INTO ads_asset_portal_summary (
    asset_layer, asset_count, ready_count, total_rows, refreshed_at
  )
  SELECT
    asset_layer,
    COUNT(*) AS asset_count,
    COUNT(*) FILTER (WHERE status = 'ready') AS ready_count,
    COALESCE(SUM(row_count), 0) AS total_rows,
    now()
  FROM meta_asset_catalog
  GROUP BY asset_layer;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION stats_refresh_road_daily_stats()
RETURNS void AS $$
BEGIN
  TRUNCATE road_daily_stats;
  INSERT INTO road_daily_stats (
    metric_date, road_id, road_name, trip_count, vehicle_count,
    total_distance_m, avg_speed_kmh, peak_hour, updated_at
  )
  WITH road_trips AS (
    SELECT
      t.trip_date,
      s.road_id,
      s.road_name,
      t.id AS trip_id,
      t.devid,
      s.distance_m,
      s.avg_speed_kmh,
      EXTRACT(HOUR FROM t.start_time)::integer AS start_hour
    FROM trips t
    JOIN trip_segments s ON s.trip_id = t.id
    WHERE t.is_valid = true
      AND s.road_id IS NOT NULL
  ),
  road_hour_counts AS (
    SELECT
      trip_date, road_id, start_hour,
      COUNT(*) AS cnt
    FROM road_trips
    WHERE start_hour IS NOT NULL
    GROUP BY trip_date, road_id, start_hour
  ),
  peak_hours AS (
    SELECT DISTINCT ON (trip_date, road_id)
      trip_date, road_id, start_hour AS peak_hour
    FROM road_hour_counts
    ORDER BY trip_date, road_id, cnt DESC, start_hour
  )
  SELECT
    rt.trip_date,
    rt.road_id,
    MAX(rt.road_name) AS road_name,
    COUNT(DISTINCT rt.trip_id) AS trip_count,
    COUNT(DISTINCT rt.devid) AS vehicle_count,
    COALESCE(SUM(rt.distance_m), 0) AS total_distance_m,
    AVG(rt.avg_speed_kmh) FILTER (WHERE rt.avg_speed_kmh IS NOT NULL) AS avg_speed_kmh,
    ph.peak_hour,
    now()
  FROM road_trips rt
  LEFT JOIN peak_hours ph ON ph.trip_date = rt.trip_date AND ph.road_id = rt.road_id
  GROUP BY rt.trip_date, rt.road_id, ph.peak_hour;
END;
$$ LANGUAGE plpgsql;
