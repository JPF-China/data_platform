from __future__ import annotations

import psycopg


def ensure_tdm_ads_schema(cur: psycopg.Cursor) -> None:
    cur.execute(
        """
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
        """
    )


def aggregate_vehicle_profiles(cur: psycopg.Cursor) -> None:
    ensure_tdm_ads_schema(cur)
    cur.execute("TRUNCATE tdm_vehicle_tag, tdm_vehicle_profile RESTART IDENTITY CASCADE")
    cur.execute(
        """
        INSERT INTO tdm_vehicle_profile (
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
          MIN(tf.trip_date) AS first_trip_date,
          MAX(tf.trip_date) AS last_trip_date,
          COUNT(DISTINCT tf.trip_date) AS active_days,
          COUNT(*) AS trip_count,
          COALESCE(SUM(tf.trip_distance_m), 0) AS total_distance_m,
          AVG(tf.trip_distance_m) AS avg_trip_distance_m,
          AVG(tf.trip_avg_speed_kmh) AS avg_speed_kmh,
          SUM(tf.morning_trip) AS morning_trip_count,
          SUM(tf.night_trip) AS night_trip_count,
          SUM(tf.peak_trip) AS peak_trip_count,
          SUM(tf.short_trip) AS short_trip_count,
          SUM(tf.long_trip) AS long_trip_count,
          dh.dominant_start_hour,
          now()
        FROM trip_feature tf
        LEFT JOIN dominant_hour dh ON dh.vehicle_id = tf.vehicle_id
        GROUP BY tf.vehicle_id, dh.dominant_start_hour
        ORDER BY tf.vehicle_id
        """
    )


def aggregate_vehicle_tags(cur: psycopg.Cursor) -> None:
    ensure_tdm_ads_schema(cur)
    cur.execute("TRUNCATE tdm_vehicle_tag")
    cur.execute(
        """
        WITH base_tags AS (
          SELECT
            vehicle_id,
            'commuter'::text AS tag_code,
            '高峰通勤车'::text AS tag_name,
            'statistical'::text AS tag_type,
            ROUND(peak_trip_count::numeric / GREATEST(trip_count, 1), 4)::double precision AS tag_score,
            jsonb_build_object(
              'peak_trip_count', peak_trip_count,
              'trip_count', trip_count,
              'dominant_start_hour', dominant_start_hour
            ) AS evidence
          FROM tdm_vehicle_profile
          WHERE peak_trip_count >= GREATEST(1, CEIL(trip_count * 0.5))

          UNION ALL

          SELECT
            vehicle_id,
            'night_active',
            '夜间活跃车',
            'statistical',
            ROUND(night_trip_count::numeric / GREATEST(trip_count, 1), 4)::double precision,
            jsonb_build_object(
              'night_trip_count', night_trip_count,
              'trip_count', trip_count
            )
          FROM tdm_vehicle_profile
          WHERE night_trip_count >= GREATEST(1, CEIL(trip_count * 0.33))

          UNION ALL

          SELECT
            vehicle_id,
            'short_high_freq',
            '短途高频车',
            'statistical',
            ROUND(short_trip_count::numeric / GREATEST(trip_count, 1), 4)::double precision,
            jsonb_build_object(
              'short_trip_count', short_trip_count,
              'trip_count', trip_count,
              'avg_trip_distance_m', avg_trip_distance_m
            )
          FROM tdm_vehicle_profile
          WHERE trip_count >= 3
            AND avg_trip_distance_m IS NOT NULL
            AND avg_trip_distance_m < 5000

          UNION ALL

          SELECT
            vehicle_id,
            'long_distance',
            '长途跨区车',
            'statistical',
            ROUND(
              GREATEST(
                COALESCE(avg_trip_distance_m, 0) / 10000.0,
                COALESCE(total_distance_m, 0) / 30000.0
              )::numeric,
              4
            )::double precision,
            jsonb_build_object(
              'avg_trip_distance_m', avg_trip_distance_m,
              'total_distance_m', total_distance_m
            )
          FROM tdm_vehicle_profile
          WHERE COALESCE(avg_trip_distance_m, 0) >= 8000
             OR COALESCE(total_distance_m, 0) >= 20000
        ),
        fallback_tags AS (
          SELECT
            vp.vehicle_id,
            'steady_vehicle'::text AS tag_code,
            '常规活跃车'::text AS tag_name,
            'statistical'::text AS tag_type,
            1.0::double precision AS tag_score,
            jsonb_build_object(
              'trip_count', vp.trip_count,
              'active_days', vp.active_days
            ) AS evidence
          FROM tdm_vehicle_profile vp
          WHERE NOT EXISTS (
            SELECT 1
            FROM base_tags bt
            WHERE bt.vehicle_id = vp.vehicle_id
          )
        )
        INSERT INTO tdm_vehicle_tag (
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
          tag_code,
          tag_name,
          tag_type,
          tag_score,
          evidence,
          now()
        FROM (
          SELECT * FROM base_tags
          UNION ALL
          SELECT * FROM fallback_tags
        ) tags
        ORDER BY vehicle_id, tag_code
        """
    )


def aggregate_road_profiles(cur: psycopg.Cursor) -> None:
    ensure_tdm_ads_schema(cur)
    cur.execute("TRUNCATE tdm_road_profile")
    cur.execute(
        """
        INSERT INTO tdm_road_profile (
          road_id,
          road_name,
          active_days,
          bucket_count,
          trip_count,
          vehicle_count,
          flow_count,
          total_distance_m,
          median_speed_kmh,
          peak_bucket_count,
          congestion_bucket_count,
          updated_at
        )
        WITH heat AS (
          SELECT
            road_id,
            MAX(road_name) AS road_name,
            COUNT(DISTINCT metric_date) AS active_days,
            COUNT(*) AS bucket_count,
            COALESCE(SUM(trip_count), 0) AS trip_count,
            COALESCE(SUM(vehicle_count), 0) AS vehicle_count,
            COALESCE(SUM(flow_count), 0) AS flow_count,
            COALESCE(SUM(distance_m), 0) AS total_distance_m
          FROM heatmap_bins
          WHERE road_id IS NOT NULL
          GROUP BY road_id
        ),
        speed AS (
          SELECT
            road_id,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY COALESCE(median_speed_kmh, mean_speed_kmh)
            ) AS median_speed_kmh,
            COUNT(*) FILTER (
              WHERE (
                EXTRACT(HOUR FROM bucket_start) BETWEEN 7 AND 9
                OR EXTRACT(HOUR FROM bucket_start) BETWEEN 17 AND 20
              )
            ) AS peak_bucket_count,
            COUNT(*) FILTER (
              WHERE COALESCE(median_speed_kmh, mean_speed_kmh) < 20
            ) AS congestion_bucket_count
          FROM road_speed_bins
          WHERE road_id IS NOT NULL
          GROUP BY road_id
        )
        SELECT
          COALESCE(h.road_id, s.road_id) AS road_id,
          h.road_name,
          COALESCE(h.active_days, 0) AS active_days,
          COALESCE(h.bucket_count, 0) AS bucket_count,
          COALESCE(h.trip_count, 0) AS trip_count,
          COALESCE(h.vehicle_count, 0) AS vehicle_count,
          COALESCE(h.flow_count, 0) AS flow_count,
          COALESCE(h.total_distance_m, 0) AS total_distance_m,
          s.median_speed_kmh,
          COALESCE(s.peak_bucket_count, 0) AS peak_bucket_count,
          COALESCE(s.congestion_bucket_count, 0) AS congestion_bucket_count,
          now()
        FROM heat h
        FULL OUTER JOIN speed s ON s.road_id = h.road_id
        WHERE COALESCE(h.road_id, s.road_id) IS NOT NULL
        ORDER BY COALESCE(h.road_id, s.road_id)
        """
    )


def aggregate_ads_vehicle_tag_summary(cur: psycopg.Cursor) -> None:
    ensure_tdm_ads_schema(cur)
    cur.execute("TRUNCATE ads_vehicle_tag_summary")
    cur.execute(
        """
        INSERT INTO ads_vehicle_tag_summary (
          tag_code,
          tag_name,
          vehicle_count,
          avg_trip_count,
          avg_trip_distance_m,
          avg_speed_kmh,
          updated_at
        )
        SELECT
          vt.tag_code,
          MAX(vt.tag_name) AS tag_name,
          COUNT(DISTINCT vt.vehicle_id) AS vehicle_count,
          AVG(vp.trip_count) AS avg_trip_count,
          AVG(vp.avg_trip_distance_m) AS avg_trip_distance_m,
          AVG(vp.avg_speed_kmh) AS avg_speed_kmh,
          now()
        FROM tdm_vehicle_tag vt
        JOIN tdm_vehicle_profile vp ON vp.vehicle_id = vt.vehicle_id
        GROUP BY vt.tag_code
        ORDER BY vehicle_count DESC, vt.tag_code
        """
    )


def aggregate_ads_vehicle_segments(cur: psycopg.Cursor) -> None:
    ensure_tdm_ads_schema(cur)
    cur.execute("TRUNCATE ads_vehicle_segments")
    cur.execute(
        """
        INSERT INTO ads_vehicle_segments (
          tag_code,
          road_id,
          tag_name,
          road_name,
          trip_count,
          vehicle_count,
          distance_m,
          avg_speed_kmh,
          updated_at
        )
        SELECT
          vt.tag_code,
          s.road_id,
          MAX(vt.tag_name) AS tag_name,
          MAX(s.road_name) AS road_name,
          COUNT(*) AS trip_count,
          COUNT(DISTINCT t.devid) AS vehicle_count,
          COALESCE(SUM(s.distance_m), 0) AS distance_m,
          AVG(s.avg_speed_kmh) AS avg_speed_kmh,
          now()
        FROM tdm_vehicle_tag vt
        JOIN trips t ON t.devid = vt.vehicle_id
        JOIN trip_segments s ON s.trip_id = t.id
        WHERE t.is_valid = true
          AND s.road_id IS NOT NULL
        GROUP BY vt.tag_code, s.road_id
        ORDER BY vt.tag_code, trip_count DESC, distance_m DESC
        """
    )


def aggregate_ads_route_strategy(cur: psycopg.Cursor) -> None:
    ensure_tdm_ads_schema(cur)
    cur.execute("TRUNCATE ads_route_strategy")
    cur.execute(
        """
        INSERT INTO ads_route_strategy (
          strategy_date,
          bucket_start,
          bucket_end,
          road_count,
          congested_road_count,
          avg_speed_kmh,
          congestion_ratio,
          recommendation_level,
          details,
          updated_at
        )
        WITH bucket_stats AS (
          SELECT
            bucket_start::date AS strategy_date,
            bucket_start,
            MAX(bucket_end) AS bucket_end,
            COUNT(DISTINCT road_id) AS road_count,
            COUNT(DISTINCT road_id) FILTER (
              WHERE COALESCE(median_speed_kmh, mean_speed_kmh) < 20
            ) AS congested_road_count,
            AVG(COALESCE(median_speed_kmh, mean_speed_kmh)) AS avg_speed_kmh
          FROM road_speed_bins
          WHERE road_id IS NOT NULL
          GROUP BY bucket_start::date, bucket_start
        )
        SELECT
          strategy_date,
          bucket_start,
          bucket_end,
          road_count,
          congested_road_count,
          avg_speed_kmh,
          CASE
            WHEN road_count > 0
            THEN ROUND(congested_road_count::numeric / road_count, 4)::double precision
            ELSE 0
          END AS congestion_ratio,
          CASE
            WHEN COALESCE(avg_speed_kmh, 0) >= 35
             AND COALESCE(congested_road_count::numeric / NULLIF(road_count, 0), 0) <= 0.15
            THEN 'smooth'
            WHEN COALESCE(avg_speed_kmh, 0) >= 25
             AND COALESCE(congested_road_count::numeric / NULLIF(road_count, 0), 0) <= 0.35
            THEN 'balanced'
            ELSE 'congested'
          END AS recommendation_level,
          jsonb_build_object(
            'road_count', road_count,
            'congested_road_count', congested_road_count,
            'avg_speed_kmh', avg_speed_kmh
          ) AS details,
          now()
        FROM bucket_stats
        ORDER BY bucket_start
        """
    )


def aggregate_tdm_and_ads_models(cur: psycopg.Cursor) -> None:
    aggregate_vehicle_profiles(cur)
    aggregate_vehicle_tags(cur)
    aggregate_road_profiles(cur)
    aggregate_ads_vehicle_tag_summary(cur)
    aggregate_ads_vehicle_segments(cur)
    aggregate_ads_route_strategy(cur)
