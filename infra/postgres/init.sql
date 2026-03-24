CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgrouting;
EXCEPTION
  WHEN feature_not_supported OR undefined_file THEN
    RAISE NOTICE 'pgrouting extension is unavailable in current environment';
END
$$;

CREATE TABLE IF NOT EXISTS road_segments (
  id bigserial PRIMARY KEY,
  road_id text UNIQUE,
  osm_id bigint,
  class_id integer,
  road_name text,
  highway text,
  oneway boolean,
  maxspeed integer,
  geom geometry(LineString, 4326),
  length_m double precision,
  source_node bigint,
  target_node bigint,
  cost double precision,
  reverse_cost double precision,
  travel_time_s double precision,
  source text
);

CREATE TABLE IF NOT EXISTS bfmap_ways_import (
  gid bigint PRIMARY KEY,
  osm_id bigint,
  class_id integer,
  source bigint,
  target bigint,
  length double precision,
  reverse integer,
  maxspeed_forward double precision,
  maxspeed_backward double precision,
  priority double precision,
  geom geometry(LineString, 4326)
);

CREATE TABLE IF NOT EXISTS ingest_road_map (
  id bigserial PRIMARY KEY,
  trip_road_id text NOT NULL,
  osm_id bigint NOT NULL,
  road_segment_id bigint NOT NULL REFERENCES road_segments(id) ON DELETE CASCADE,
  mapping_source text NOT NULL,
  confidence double precision,
  mapping_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_road_id, osm_id)
);

ALTER TABLE road_segments ADD COLUMN IF NOT EXISTS source_node bigint;
ALTER TABLE road_segments ADD COLUMN IF NOT EXISTS target_node bigint;
ALTER TABLE road_segments ADD COLUMN IF NOT EXISTS travel_time_s double precision;
ALTER TABLE road_segments ADD COLUMN IF NOT EXISTS osm_id bigint;
ALTER TABLE road_segments ADD COLUMN IF NOT EXISTS class_id integer;
ALTER TABLE road_segments ADD COLUMN IF NOT EXISTS cost double precision;
ALTER TABLE road_segments ADD COLUMN IF NOT EXISTS reverse_cost double precision;

CREATE TABLE IF NOT EXISTS route_results (
  id bigserial PRIMARY KEY,
  query_time timestamp NOT NULL,
  start_point geometry(Point, 4326) NOT NULL,
  end_point geometry(Point, 4326) NOT NULL,
  route_type text NOT NULL,
  distance_m double precision NOT NULL,
  estimated_time_s double precision NOT NULL,
  path_geom geometry(MultiLineString, 4326) NOT NULL,
  path_json jsonb,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_start ON route_results USING gist(start_point);
CREATE INDEX IF NOT EXISTS idx_route_end ON route_results USING gist(end_point);
CREATE INDEX IF NOT EXISTS idx_road_segments_geom ON road_segments USING gist(geom);
CREATE INDEX IF NOT EXISTS idx_road_segments_source_node ON road_segments(source_node);
CREATE INDEX IF NOT EXISTS idx_road_segments_target_node ON road_segments(target_node);
CREATE INDEX IF NOT EXISTS idx_road_segments_osm_id ON road_segments(osm_id);
CREATE INDEX IF NOT EXISTS idx_road_segments_source_tag ON road_segments(source);
CREATE INDEX IF NOT EXISTS idx_bfmap_ways_osm_id ON bfmap_ways_import(osm_id);
CREATE INDEX IF NOT EXISTS idx_bfmap_ways_source_target ON bfmap_ways_import(source, target);
CREATE INDEX IF NOT EXISTS idx_bfmap_ways_geom ON bfmap_ways_import USING gist(geom);
CREATE INDEX IF NOT EXISTS idx_ingest_road_map_trip_road_id ON ingest_road_map(trip_road_id);
CREATE INDEX IF NOT EXISTS idx_ingest_road_map_osm_id ON ingest_road_map(osm_id);
CREATE INDEX IF NOT EXISTS idx_ingest_road_map_segment_id ON ingest_road_map(road_segment_id);

DROP TABLE IF EXISTS osm_road_edges;
