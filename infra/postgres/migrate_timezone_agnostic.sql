-- Convert business datetime columns from timestamptz to timestamp (without time zone).
--
-- Behavior:
-- 1) Existing timestamptz values are rewritten to business wall-clock time.
-- 2) Conversion uses the configured business timezone, default: Asia/Shanghai.
--
-- Optional override before running this script:
--   SET app.business_timezone = 'Asia/Shanghai';
--
-- Run example:
--   psql "dbname=harbin_traffic user=apple host=localhost port=5432" -f infra/postgres/migrate_timezone_agnostic.sql

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '0';

CREATE OR REPLACE FUNCTION pg_temp.convert_timestamptz_to_timestamp(
    p_table text,
    p_column text,
    p_business_tz text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    table_oid regclass;
    col_exists boolean;
    current_type text;
BEGIN
    table_oid := to_regclass(p_table);
    IF table_oid IS NULL THEN
        RAISE NOTICE 'skip %.% (table not found)', p_table, p_column;
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = table_oid
          AND attname = p_column
          AND attnum > 0
          AND NOT attisdropped
    ) INTO col_exists;

    IF NOT col_exists THEN
        RAISE NOTICE 'skip %.% (column not found)', p_table, p_column;
        RETURN;
    END IF;

    SELECT format_type(a.atttypid, a.atttypmod)
    INTO current_type
    FROM pg_attribute a
    WHERE a.attrelid = table_oid
      AND a.attname = p_column
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF current_type = 'timestamp with time zone' THEN
        EXECUTE format(
            'ALTER TABLE %s ALTER COLUMN %I TYPE timestamp USING (%I AT TIME ZONE %L)',
            table_oid,
            p_column,
            p_column,
            p_business_tz
        );
        RAISE NOTICE 'converted %.% from timestamptz to timestamp using timezone %', p_table, p_column, p_business_tz;
    ELSIF current_type = 'timestamp without time zone' THEN
        RAISE NOTICE 'skip %.% (already timestamp)', p_table, p_column;
    ELSE
        RAISE NOTICE 'skip %.% (type is %)', p_table, p_column, current_type;
    END IF;
END;
$$;

DO $$
DECLARE
    business_tz text := COALESCE(
        NULLIF(current_setting('app.business_timezone', true), ''),
        'Asia/Shanghai'
    );
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = business_tz) THEN
        RAISE EXCEPTION 'Invalid timezone: %', business_tz;
    END IF;

    PERFORM pg_temp.convert_timestamptz_to_timestamp('trips', 'start_time', business_tz);
    PERFORM pg_temp.convert_timestamptz_to_timestamp('trips', 'end_time', business_tz);

    PERFORM pg_temp.convert_timestamptz_to_timestamp('trip_points_raw', 'event_time', business_tz);
    PERFORM pg_temp.convert_timestamptz_to_timestamp('trip_points_matched', 'event_time', business_tz);

    PERFORM pg_temp.convert_timestamptz_to_timestamp('trip_segments', 'start_time', business_tz);
    PERFORM pg_temp.convert_timestamptz_to_timestamp('trip_segments', 'end_time', business_tz);

    PERFORM pg_temp.convert_timestamptz_to_timestamp('heatmap_bins', 'time_bucket_start', business_tz);
    PERFORM pg_temp.convert_timestamptz_to_timestamp('heatmap_bins', 'time_bucket_end', business_tz);

    PERFORM pg_temp.convert_timestamptz_to_timestamp('road_speed_bins', 'bucket_start', business_tz);
    PERFORM pg_temp.convert_timestamptz_to_timestamp('road_speed_bins', 'bucket_end', business_tz);

    PERFORM pg_temp.convert_timestamptz_to_timestamp('route_results', 'query_time', business_tz);
END;
$$;

COMMIT;
