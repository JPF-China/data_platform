from __future__ import annotations

import psycopg


def aggregate_daily_metrics(cur: psycopg.Cursor) -> None:
    cur.execute("TRUNCATE daily_metrics")
    cur.execute(
        """
        INSERT INTO daily_metrics (
          metric_date, trip_count, vehicle_count, distance_m, distance_km,
          avg_trip_distance_m, median_trip_distance_m, avg_speed_kmh
        )
        WITH valid_trips AS (
          SELECT id, devid, trip_date
          FROM trips
          WHERE trip_date IS NOT NULL
            AND is_valid = true
        ),
        trip_distance AS (
          SELECT s.trip_id, SUM(s.distance_m) AS trip_distance_m
          FROM trip_segments s
          JOIN valid_trips vt ON vt.id = s.trip_id
          GROUP BY s.trip_id
        ),
        day_trip_stats AS (
          SELECT
            vt.trip_date AS metric_date,
            COUNT(DISTINCT vt.id) AS trip_count,
            COUNT(DISTINCT vt.devid) AS vehicle_count,
            COALESCE(SUM(td.trip_distance_m), 0) AS distance_m,
            AVG(td.trip_distance_m) AS avg_trip_distance_m,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY td.trip_distance_m) AS median_trip_distance_m
          FROM valid_trips vt
          LEFT JOIN trip_distance td ON td.trip_id = vt.id
          GROUP BY vt.trip_date
        ),
        day_speed_stats AS (
          SELECT vt.trip_date AS metric_date, AVG(s.avg_speed_kmh) AS avg_speed_kmh
          FROM trip_segments s
          JOIN valid_trips vt ON vt.id = s.trip_id
          WHERE s.avg_speed_kmh IS NOT NULL
          GROUP BY vt.trip_date
        )
        SELECT
          d.metric_date,
          d.trip_count,
          d.vehicle_count,
          d.distance_m,
          d.distance_m / 1000.0 AS distance_km,
          d.avg_trip_distance_m,
          d.median_trip_distance_m,
          s.avg_speed_kmh
        FROM day_trip_stats d
        LEFT JOIN day_speed_stats s ON s.metric_date = d.metric_date
        ORDER BY d.metric_date
        """
    )


def aggregate_daily_distance_boxplot(cur: psycopg.Cursor) -> None:
    cur.execute("TRUNCATE daily_distance_boxplot")
    cur.execute(
        """
        INSERT INTO daily_distance_boxplot (
          metric_date,
          min_value,
          q1_value,
          median_value,
          q3_value,
          max_value,
          sample_count
        )
        WITH valid_trips AS (
          SELECT id, trip_date
          FROM trips
          WHERE trip_date IS NOT NULL
            AND is_valid = true
        ),
        trip_distance AS (
          SELECT vt.trip_date AS metric_date, s.trip_id, SUM(s.distance_m) AS trip_distance_m
          FROM trip_segments s
          JOIN valid_trips vt ON vt.id = s.trip_id
          GROUP BY vt.trip_date, s.trip_id
        )
        SELECT
          metric_date,
          MIN(trip_distance_m) AS min_value,
          percentile_cont(0.25) WITHIN GROUP (ORDER BY trip_distance_m) AS q1_value,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY trip_distance_m) AS median_value,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY trip_distance_m) AS q3_value,
          MAX(trip_distance_m) AS max_value,
          COUNT(*) AS sample_count
        FROM trip_distance
        GROUP BY metric_date
        ORDER BY metric_date
        """
    )


def aggregate_daily_speed_boxplot(cur: psycopg.Cursor) -> None:
    cur.execute("TRUNCATE daily_speed_boxplot")
    cur.execute(
        """
        INSERT INTO daily_speed_boxplot (
          metric_date,
          min_value,
          q1_value,
          median_value,
          q3_value,
          max_value,
          sample_count
        )
        SELECT
          t.trip_date AS metric_date,
          MIN(s.avg_speed_kmh) AS min_value,
          percentile_cont(0.25) WITHIN GROUP (ORDER BY s.avg_speed_kmh) AS q1_value,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY s.avg_speed_kmh) AS median_value,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY s.avg_speed_kmh) AS q3_value,
          MAX(s.avg_speed_kmh) AS max_value,
          COUNT(*) AS sample_count
        FROM trip_segments s
        JOIN trips t ON t.id = s.trip_id
        WHERE t.trip_date IS NOT NULL
          AND t.is_valid = true
          AND s.avg_speed_kmh IS NOT NULL
        GROUP BY t.trip_date
        ORDER BY t.trip_date
        """
    )


def aggregate_heatmap_bins(cur: psycopg.Cursor) -> None:
    cur.execute("TRUNCATE heatmap_bins")
    cur.execute(
        """
        INSERT INTO heatmap_bins (
          metric_date, time_bucket_start, time_bucket_end, road_id, road_name,
          trip_count, vehicle_count, flow_count, distance_m, geom
        )
        WITH road_geom AS (
          SELECT
            road_id,
            ST_Multi(ST_LineMerge(ST_Union(geom)))::geometry(MultiLineString, 4326) AS geom
          FROM road_segments
          WHERE road_id IS NOT NULL
            AND geom IS NOT NULL
          GROUP BY road_id
        ),
        traffic AS (
          SELECT
            t.trip_date AS metric_date,
            date_trunc('minute', s.start_time)
              - make_interval(mins => (extract(minute from s.start_time)::int % 5)) AS time_bucket_start,
            date_trunc('minute', s.start_time)
              - make_interval(mins => (extract(minute from s.start_time)::int % 5))
              + interval '5 minutes' AS time_bucket_end,
            rs.road_id AS road_id,
            MAX(s.road_name) AS road_name,
            COUNT(DISTINCT s.trip_id) AS trip_count,
            COUNT(DISTINCT t.devid) AS vehicle_count,
            COUNT(*) AS flow_count,
            SUM(s.distance_m) AS distance_m
          FROM trip_segments s
          JOIN trips t ON t.id = s.trip_id
          JOIN ingest_road_map map ON map.trip_road_id = s.road_id
          JOIN road_segments rs ON rs.id = map.road_segment_id
          WHERE s.start_time IS NOT NULL
            AND t.trip_date IS NOT NULL
            AND t.is_valid = true
          GROUP BY t.trip_date,
                   time_bucket_start,
                   time_bucket_end,
                   rs.road_id
        )
        SELECT
          tr.metric_date,
          tr.time_bucket_start,
          tr.time_bucket_end,
          tr.road_id,
          tr.road_name,
          tr.trip_count,
          tr.vehicle_count,
          tr.flow_count,
          tr.distance_m,
          rg.geom
        FROM traffic tr
        LEFT JOIN road_geom rg ON rg.road_id = tr.road_id
        """
    )


def aggregate_road_speed_bins(cur: psycopg.Cursor) -> None:
    cur.execute("TRUNCATE road_speed_bins")
    cur.execute(
        """
        INSERT INTO road_speed_bins (
          road_id, bucket_start, bucket_end,
          median_speed_kmh, mean_speed_kmh, sample_count
        )
        WITH buckets AS (
          SELECT
            rs.road_id,
            date_trunc('minute', s.start_time)
              - make_interval(mins => (extract(minute from s.start_time)::int % 5)) AS bucket_start,
            date_trunc('minute', s.start_time)
              - make_interval(mins => (extract(minute from s.start_time)::int % 5))
              + interval '5 minutes' AS bucket_end,
            s.avg_speed_kmh
          FROM trip_segments s
          JOIN trips t ON t.id = s.trip_id
          JOIN ingest_road_map map ON map.trip_road_id = s.road_id
          JOIN road_segments rs ON rs.id = map.road_segment_id
          WHERE s.start_time IS NOT NULL
            AND s.road_id IS NOT NULL
            AND s.avg_speed_kmh IS NOT NULL
            AND t.is_valid = true
        )
        SELECT
          road_id,
          bucket_start,
          bucket_end,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY avg_speed_kmh) AS median_speed_kmh,
          AVG(avg_speed_kmh) AS mean_speed_kmh,
          COUNT(*) AS sample_count
        FROM buckets
        GROUP BY road_id, bucket_start, bucket_end
        ON CONFLICT (road_id, bucket_start) DO UPDATE
          SET
            bucket_end = EXCLUDED.bucket_end,
            median_speed_kmh = EXCLUDED.median_speed_kmh,
            mean_speed_kmh = EXCLUDED.mean_speed_kmh,
            sample_count = EXCLUDED.sample_count,
            updated_at = now()
        """
    )


def aggregate_table_row_stats(cur: psycopg.Cursor) -> None:
    cur.execute(
        """
        ANALYZE trips,
                trip_points_raw,
                trip_match_meta,
                trip_points_matched,
                trip_segments,
                ingest_road_map,
                daily_metrics,
                daily_distance_boxplot,
                daily_speed_boxplot,
                heatmap_bins,
                road_segments,
                road_speed_bins,
                route_results
        """
    )
    cur.execute("TRUNCATE table_row_stats")
    cur.execute(
        """
        INSERT INTO table_row_stats (table_name, row_count, refreshed_at)
        SELECT
          t.table_name,
          CASE t.table_name
            WHEN 'daily_metrics' THEN (SELECT COUNT(*) FROM daily_metrics)
            WHEN 'daily_distance_boxplot' THEN (SELECT COUNT(*) FROM daily_distance_boxplot)
            WHEN 'daily_speed_boxplot' THEN (SELECT COUNT(*) FROM daily_speed_boxplot)
            WHEN 'heatmap_bins' THEN (SELECT COUNT(*) FROM heatmap_bins)
            WHEN 'road_speed_bins' THEN (SELECT COUNT(*) FROM road_speed_bins)
            WHEN 'ingest_road_map' THEN (SELECT COUNT(*) FROM ingest_road_map)
            ELSE COALESCE(s.n_live_tup::bigint, 0)
          END AS row_count,
          now() AS refreshed_at
        FROM (
          VALUES
            ('trips'),
            ('trip_points_raw'),
            ('trip_match_meta'),
            ('trip_points_matched'),
            ('trip_segments'),
            ('ingest_road_map'),
            ('daily_metrics'),
            ('daily_distance_boxplot'),
            ('daily_speed_boxplot'),
            ('heatmap_bins'),
            ('road_segments'),
            ('road_speed_bins'),
            ('route_results')
        ) AS t(table_name)
        LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
        ORDER BY t.table_name
        """
    )
