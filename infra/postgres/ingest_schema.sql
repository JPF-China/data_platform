CREATE TABLE IF NOT EXISTS ingest_runs (
  id bigserial PRIMARY KEY,
  run_type text NOT NULL,
  source_file text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  row_count integer NOT NULL DEFAULT 0,
  error_message text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ingest_file_state (
  id bigserial PRIMARY KEY,
  file_path text NOT NULL UNIQUE,
  file_type text NOT NULL,
  file_size bigint NOT NULL,
  file_mtime timestamptz NOT NULL,
  file_signature text NOT NULL,
  last_run_id bigint REFERENCES ingest_runs(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trips (
  id bigserial PRIMARY KEY,
  trip_uid text UNIQUE NOT NULL,
  source_trip_key text,
  devid text,
  trip_date date,
  start_time timestamp,
  end_time timestamp,
  point_count integer NOT NULL DEFAULT 0,
  valid_point_count integer NOT NULL DEFAULT 0,
  is_valid boolean NOT NULL DEFAULT true,
  source_file text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trip_points_raw (
  id bigserial PRIMARY KEY,
  trip_id bigint NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  point_seq integer NOT NULL,
  event_time timestamp,
  tms bigint,
  devid text,
  lat double precision,
  lon double precision,
  speed double precision,
  geom geometry(Point, 4326),
  is_valid boolean NOT NULL DEFAULT true,
  invalid_reason text,
  UNIQUE (trip_id, point_seq)
);

CREATE TABLE IF NOT EXISTS trip_match_meta (
  id bigserial PRIMARY KEY,
  trip_id bigint NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  point_seq integer NOT NULL,
  matched_seq integer,
  road_id text,
  road_name text,
  direction text,
  is_virtual boolean NOT NULL DEFAULT false,
  confidence double precision,
  segment_fraction double precision,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trip_points_matched (
  id bigserial PRIMARY KEY,
  trip_id bigint NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  point_seq integer NOT NULL,
  event_time timestamp,
  tms bigint,
  lat double precision,
  lon double precision,
  geom geometry(Point, 4326),
  road_id text,
  road_name text,
  matched_offset_m double precision,
  confidence double precision,
  is_virtual boolean NOT NULL DEFAULT false,
  UNIQUE (trip_id, point_seq)
);

CREATE TABLE IF NOT EXISTS trip_segments (
  id bigserial PRIMARY KEY,
  trip_id bigint NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  segment_seq integer NOT NULL,
  from_point_seq integer NOT NULL,
  to_point_seq integer NOT NULL,
  start_time timestamp,
  end_time timestamp,
  distance_m double precision NOT NULL,
  duration_s double precision,
  avg_speed_kmh double precision,
  road_id text,
  road_name text,
  start_lat double precision,
  start_lon double precision,
  end_lat double precision,
  end_lon double precision,
  path_geom geometry(LineString, 4326),
  UNIQUE (trip_id, segment_seq)
);

CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(trip_date);
CREATE INDEX IF NOT EXISTS idx_trips_devid_date ON trips(devid, trip_date);
CREATE INDEX IF NOT EXISTS idx_raw_trip_seq ON trip_points_raw(trip_id, point_seq);
CREATE INDEX IF NOT EXISTS idx_raw_geom ON trip_points_raw USING gist(geom);
CREATE INDEX IF NOT EXISTS idx_matched_trip_seq ON trip_points_matched(trip_id, point_seq);
CREATE INDEX IF NOT EXISTS idx_matched_geom ON trip_points_matched USING gist(geom);
CREATE INDEX IF NOT EXISTS idx_segments_trip_seq ON trip_segments(trip_id, segment_seq);
CREATE INDEX IF NOT EXISTS idx_segments_road ON trip_segments(road_id);
