from __future__ import annotations

from datetime import date, datetime
from typing import Any

import psycopg
from psycopg import sql
from psycopg.types.json import Json
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.route_capability_service import get_route_capability

ASSET_CATALOG_DEFINITIONS: tuple[dict[str, str], ...] = (
    {
        "asset_key": "ods_ingest_runs",
        "display_name": "采集任务登记",
        "asset_layer": "ODS",
        "asset_type": "table",
        "source_table": "ingest_runs",
        "description": "原始采集任务与运行记录",
    },
    {
        "asset_key": "ods_trip_points_raw",
        "display_name": "原始轨迹点",
        "asset_layer": "ODS",
        "asset_type": "table",
        "source_table": "trip_points_raw",
        "description": "贴源落库的原始轨迹点明细",
    },
    {
        "asset_key": "dw_trips",
        "display_name": "行程明细",
        "asset_layer": "DW",
        "asset_type": "table",
        "source_table": "trips",
        "description": "清洗后的行程主表",
    },
    {
        "asset_key": "dw_trip_segments",
        "display_name": "轨迹分段明细",
        "asset_layer": "DW",
        "asset_type": "table",
        "source_table": "trip_segments",
        "description": "轨迹切分后的路段事实",
    },
    {
        "asset_key": "tdm_road_mapping",
        "display_name": "道路映射资产",
        "asset_layer": "TDM",
        "asset_type": "table",
        "source_table": "ingest_road_map",
        "description": "业务道路与路网边映射关系",
    },
    {
        "asset_key": "tdm_vehicle_profile",
        "display_name": "车辆画像",
        "asset_layer": "TDM",
        "asset_type": "table",
        "source_table": "tdm_vehicle_profile",
        "description": "车辆活跃度、里程和时段偏好画像",
    },
    {
        "asset_key": "tdm_vehicle_tag",
        "display_name": "车辆标签",
        "asset_layer": "TDM",
        "asset_type": "table",
        "source_table": "tdm_vehicle_tag",
        "description": "车辆分群和圈人标签结果",
    },
    {
        "asset_key": "tdm_road_profile",
        "display_name": "道路画像",
        "asset_layer": "TDM",
        "asset_type": "table",
        "source_table": "tdm_road_profile",
        "description": "道路活跃度、速度和拥堵画像",
    },
    {
        "asset_key": "tdm_area_activity_profile",
        "display_name": "区域活跃画像",
        "asset_layer": "TDM",
        "asset_type": "table",
        "source_table": "tdm_area_activity_profile",
        "description": "按空间网格聚合的区域活跃与夜间活跃画像",
    },
    {
        "asset_key": "tdm_time_bucket_feature",
        "display_name": "时段特征画像",
        "asset_layer": "TDM",
        "asset_type": "table",
        "source_table": "tdm_time_bucket_feature",
        "description": "按时间桶聚合的流量、速度和拥堵特征画像",
    },
    {
        "asset_key": "ads_daily_metrics",
        "display_name": "总览指标",
        "asset_layer": "ADS",
        "asset_type": "table",
        "source_table": "ads_dashboard_daily",
        "description": "总览 KPI 和趋势图读模型",
    },
    {
        "asset_key": "ads_distance_boxplot",
        "display_name": "里程箱线图",
        "asset_layer": "ADS",
        "asset_type": "table",
        "source_table": "daily_distance_boxplot",
        "description": "每日里程分布读模型",
    },
    {
        "asset_key": "ads_speed_boxplot",
        "display_name": "速度箱线图",
        "asset_layer": "ADS",
        "asset_type": "table",
        "source_table": "daily_speed_boxplot",
        "description": "每日速度分布读模型",
    },
    {
        "asset_key": "ads_heatmap",
        "display_name": "热力图回放",
        "asset_layer": "ADS",
        "asset_type": "table",
        "source_table": "ads_heatmap_replay",
        "description": "道路热力图时间桶读模型",
    },
    {
        "asset_key": "ads_route_speed_bins",
        "display_name": "道路速度桶",
        "asset_layer": "ADS",
        "asset_type": "table",
        "source_table": "road_speed_bins",
        "description": "最快路径和策略推荐的速度特征读模型",
    },
    {
        "asset_key": "ads_vehicle_tag_summary",
        "display_name": "圈人标签汇总",
        "asset_layer": "ADS",
        "asset_type": "table",
        "source_table": "ads_vehicle_tag_summary",
        "description": "圈人模块使用的标签统计读模型",
    },
    {
        "asset_key": "ads_vehicle_segments",
        "display_name": "圈人道路热点",
        "asset_layer": "ADS",
        "asset_type": "table",
        "source_table": "ads_vehicle_segments",
        "description": "不同车辆标签对应的道路热点读模型",
    },
    {
        "asset_key": "ads_asset_portal_summary",
        "display_name": "资产门户汇总",
        "asset_layer": "ADS",
        "asset_type": "table",
        "source_table": "ads_asset_portal_summary",
        "description": "资产门户按层汇总统计读模型",
    },
    {
        "asset_key": "ads_route_strategy",
        "display_name": "路径策略时间窗",
        "asset_layer": "ADS",
        "asset_type": "table",
        "source_table": "ads_route_strategy",
        "description": "出发时段推荐和拥堵规避的策略读模型",
    },
    {
        "asset_key": "ads_route_recommendation",
        "display_name": "推荐结果审计",
        "asset_layer": "ADS",
        "asset_type": "table",
        "source_table": "ads_route_recommendation",
        "description": "推荐服务输出及解释的审计读模型",
    },
)


def ensure_metadata_schema(cur: psycopg.Cursor) -> None:
    cur.execute(
        """
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
        """
    )


def _table_exists_cur(cur: psycopg.Cursor, table_name: str) -> bool:
    cur.execute("SELECT to_regclass(%s) IS NOT NULL", (table_name,))
    row = cur.fetchone()
    return bool(row[0]) if row else False


def _count_rows(cur: psycopg.Cursor, table_name: str) -> int:
    if not _table_exists_cur(cur, table_name):
        return 0
    cur.execute(
        sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table_name))
    )
    row = cur.fetchone()
    return int(row[0]) if row else 0


def _fetch_table_row_stats(cur: psycopg.Cursor) -> dict[str, dict[str, Any]]:
    if not _table_exists_cur(cur, "table_row_stats"):
        return {}
    cur.execute("SELECT table_name, row_count, refreshed_at FROM table_row_stats")
    rows = cur.fetchall()
    stats: dict[str, dict[str, Any]] = {}
    for table_name, row_count, refreshed_at in rows:
        stats[str(table_name)] = {
            "row_count": int(row_count),
            "refreshed_at": refreshed_at,
        }
    return stats


def record_pipeline_job_started(
    cur: psycopg.Cursor,
    *,
    run_id: int,
    mode: str,
    source_file: str,
) -> None:
    ensure_metadata_schema(cur)
    cur.execute(
        """
        INSERT INTO meta_job_status (
          job_name, latest_run_id, status, started_at, finished_at, message, details, updated_at
        ) VALUES (
          'pipeline',
          %s,
          'running',
          now(),
          NULL,
          %s,
          %s,
          now()
        )
        ON CONFLICT (job_name) DO UPDATE SET
          latest_run_id = EXCLUDED.latest_run_id,
          status = EXCLUDED.status,
          started_at = EXCLUDED.started_at,
          finished_at = EXCLUDED.finished_at,
          message = EXCLUDED.message,
          details = EXCLUDED.details,
          updated_at = EXCLUDED.updated_at
        """,
        (
            run_id,
            f"pipeline_{mode} started",
            Json({"mode": mode, "source_file": source_file}),
        ),
    )


def record_pipeline_job_finished(
    cur: psycopg.Cursor,
    *,
    run_id: int,
    mode: str,
    status: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> None:
    ensure_metadata_schema(cur)
    cur.execute(
        """
        INSERT INTO meta_job_status (
          job_name, latest_run_id, status, started_at, finished_at, message, details, updated_at
        ) VALUES (
          'pipeline',
          %s,
          %s,
          NULL,
          now(),
          %s,
          %s,
          now()
        )
        ON CONFLICT (job_name) DO UPDATE SET
          latest_run_id = EXCLUDED.latest_run_id,
          status = EXCLUDED.status,
          finished_at = EXCLUDED.finished_at,
          message = EXCLUDED.message,
          details = EXCLUDED.details,
          updated_at = EXCLUDED.updated_at
        """,
        (run_id, status, message, Json(details or {"mode": mode})),
    )


def refresh_metadata_snapshot(cur: psycopg.Cursor) -> None:
    ensure_metadata_schema(cur)
    table_stats = _fetch_table_row_stats(cur)
    now_utc = datetime.utcnow().isoformat()

    portal_asset = next(
        asset
        for asset in ASSET_CATALOG_DEFINITIONS
        if asset["asset_key"] == "ads_asset_portal_summary"
    )

    for asset in ASSET_CATALOG_DEFINITIONS:
        if asset["asset_key"] == portal_asset["asset_key"]:
            continue
        _upsert_asset_snapshot_row(cur, asset, table_stats)

    _refresh_asset_portal_summary(cur)
    _upsert_asset_snapshot_row(cur, portal_asset, table_stats)
    _refresh_asset_portal_summary(cur)

    summary_dates = _collect_distinct_dates(cur, "ads_dashboard_daily", "metric_date")
    heatmap_dates = _collect_distinct_dates(cur, "ads_heatmap_replay", "metric_date")
    route_dates = _collect_distinct_dates(
        cur, "road_speed_bins", "bucket_start::date", cast_expression=True
    )

    _upsert_time_range(cur, "summary_dates", summary_dates)
    _upsert_time_range(cur, "heatmap_dates", heatmap_dates)
    _upsert_time_range(cur, "route_dates", route_dates)

    quality_checks = {
        "ads_daily_metrics_ready": len(summary_dates) > 0,
        "ads_heatmap_ready": len(heatmap_dates) > 0,
        "ads_route_speed_ready": len(route_dates) > 0,
    }
    for check_key, passed in quality_checks.items():
        cur.execute(
            """
            INSERT INTO meta_data_quality_check (check_key, status, checked_at, details)
            VALUES (%s, %s, now(), %s)
            ON CONFLICT (check_key) DO UPDATE SET
              status = EXCLUDED.status,
              checked_at = EXCLUDED.checked_at,
              details = EXCLUDED.details
            """,
            (
                check_key,
                "pass" if passed else "warn",
                Json({"checked_at": now_utc}),
            ),
        )


def _upsert_asset_snapshot_row(
    cur: psycopg.Cursor,
    asset: dict[str, str],
    table_stats: dict[str, dict[str, Any]],
) -> None:
    table_name = asset["source_table"]
    exists = _table_exists_cur(cur, table_name)
    row_count = _count_rows(cur, table_name)
    refreshed_at = table_stats.get(table_name, {}).get("refreshed_at")
    asset_status = "missing" if not exists else "ready" if row_count > 0 else "empty"
    cur.execute(
        """
        INSERT INTO meta_asset_catalog (
          asset_key, display_name, asset_layer, asset_type, source_table,
          status, row_count, refreshed_at, description, details
        ) VALUES (
          %s, %s, %s, %s, %s,
          %s, %s, %s, %s, %s
        )
        ON CONFLICT (asset_key) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          asset_layer = EXCLUDED.asset_layer,
          asset_type = EXCLUDED.asset_type,
          source_table = EXCLUDED.source_table,
          status = EXCLUDED.status,
          row_count = EXCLUDED.row_count,
          refreshed_at = EXCLUDED.refreshed_at,
          description = EXCLUDED.description,
          details = EXCLUDED.details
        """,
        (
            asset["asset_key"],
            asset["display_name"],
            asset["asset_layer"],
            asset["asset_type"],
            table_name,
            asset_status,
            row_count,
            refreshed_at,
            asset["description"],
            Json(
                {
                    "table_name": table_name,
                    "table_exists": exists,
                    "refreshed_via": "metadata_snapshot",
                }
            ),
        ),
    )


def _refresh_asset_portal_summary(cur: psycopg.Cursor) -> None:
    cur.execute("TRUNCATE ads_asset_portal_summary")
    cur.execute(
        """
        INSERT INTO ads_asset_portal_summary (
          asset_layer,
          asset_count,
          ready_count,
          total_rows,
          refreshed_at
        )
        SELECT
          asset_layer,
          COUNT(*) AS asset_count,
          COUNT(*) FILTER (WHERE status = 'ready') AS ready_count,
          COALESCE(SUM(row_count), 0) AS total_rows,
          now()
        FROM meta_asset_catalog
        GROUP BY asset_layer
        ORDER BY
          CASE asset_layer
            WHEN 'ODS' THEN 1
            WHEN 'DW' THEN 2
            WHEN 'TDM' THEN 3
            WHEN 'ADS' THEN 4
            ELSE 9
          END
        """
    )


def _collect_distinct_dates(
    cur: psycopg.Cursor,
    table_name: str,
    date_column: str,
    *,
    cast_expression: bool = False,
) -> list[str]:
    if not _table_exists_cur(cur, table_name):
        return []
    projection = sql.SQL(date_column) if cast_expression else sql.Identifier(date_column)
    cur.execute(
        sql.SQL("SELECT DISTINCT {} FROM {} WHERE {} IS NOT NULL ORDER BY 1").format(
            projection,
            sql.Identifier(table_name),
            projection,
        )
    )
    rows = cur.fetchall()
    values: list[str] = []
    for row in rows:
        if row and row[0] is not None:
            value = row[0]
            if isinstance(value, (date, datetime)):
                values.append(value.isoformat())
            else:
                values.append(str(value))
    return values


def _upsert_time_range(
    cur: psycopg.Cursor,
    asset_key: str,
    available_dates: list[str],
) -> None:
    min_date = available_dates[0] if available_dates else None
    max_date = available_dates[-1] if available_dates else None
    cur.execute(
        """
        INSERT INTO meta_available_time_range (
          asset_key, min_date, max_date, available_dates, details, updated_at
        ) VALUES (
          %s, %s::date, %s::date, %s, %s, now()
        )
        ON CONFLICT (asset_key) DO UPDATE SET
          min_date = EXCLUDED.min_date,
          max_date = EXCLUDED.max_date,
          available_dates = EXCLUDED.available_dates,
          details = EXCLUDED.details,
          updated_at = EXCLUDED.updated_at
        """,
        (
            asset_key,
            min_date,
            max_date,
            Json(available_dates),
            Json({"count": len(available_dates)}),
        ),
    )


def fetch_asset_catalog(db: Session) -> list[dict[str, Any]]:
    if not _table_exists(db, "meta_asset_catalog"):
        return _build_fallback_asset_catalog(db)
    rows = (
        db.execute(
            text(
                """
                SELECT
                  asset_key,
                  display_name,
                  asset_layer,
                  asset_type,
                  source_table,
                  status,
                  row_count,
                  refreshed_at,
                  description
                FROM meta_asset_catalog
                ORDER BY
                  CASE asset_layer
                    WHEN 'ODS' THEN 1
                    WHEN 'DW' THEN 2
                    WHEN 'TDM' THEN 3
                    WHEN 'ADS' THEN 4
                    ELSE 9
                  END,
                  asset_key
                """
            )
        )
        .mappings()
        .all()
    )
    if not rows:
        return _build_fallback_asset_catalog(db)
    return [
        {
            "asset_key": row["asset_key"],
            "display_name": row["display_name"],
            "asset_layer": row["asset_layer"],
            "asset_type": row["asset_type"],
            "source_table": row["source_table"],
            "status": row["status"],
            "row_count": int(row["row_count"]),
            "refreshed_at": row["refreshed_at"].isoformat()
            if row["refreshed_at"] is not None
            else None,
            "description": row["description"],
        }
        for row in rows
    ]


def fetch_asset_portal_summary(db: Session) -> dict[str, Any]:
    if _table_exists(db, "ads_asset_portal_summary"):
        rows = (
            db.execute(
                text(
                    """
                    SELECT
                      asset_layer,
                      asset_count,
                      ready_count,
                      total_rows,
                      refreshed_at
                    FROM ads_asset_portal_summary
                    ORDER BY
                      CASE asset_layer
                        WHEN 'ODS' THEN 1
                        WHEN 'DW' THEN 2
                        WHEN 'TDM' THEN 3
                        WHEN 'ADS' THEN 4
                        ELSE 9
                      END
                    """
                )
            )
            .mappings()
            .all()
        )
        if rows:
            latest_refresh = max(
                (
                    row["refreshed_at"]
                    for row in rows
                    if row["refreshed_at"] is not None
                ),
                default=None,
            )
            items = [
                {
                    "asset_layer": row["asset_layer"],
                    "asset_count": int(row["asset_count"] or 0),
                    "ready_count": int(row["ready_count"] or 0),
                    "total_rows": int(row["total_rows"] or 0),
                    "completion_rate": round(
                        int(row["ready_count"] or 0)
                        / max(1, int(row["asset_count"] or 0)),
                        4,
                    ),
                    "refreshed_at": row["refreshed_at"].isoformat()
                    if row["refreshed_at"] is not None
                    else None,
                }
                for row in rows
            ]
            return {
                "total_asset_count": sum(item["asset_count"] for item in items),
                "total_ready_count": sum(item["ready_count"] for item in items),
                "total_rows": sum(item["total_rows"] for item in items),
                "refreshed_at": latest_refresh.isoformat()
                if latest_refresh is not None
                else None,
                "items": items,
            }

    catalog = fetch_asset_catalog(db)
    grouped: dict[str, dict[str, Any]] = {}
    for item in catalog:
        layer = str(item["asset_layer"])
        layer_entry = grouped.setdefault(
            layer,
            {
                "asset_layer": layer,
                "asset_count": 0,
                "ready_count": 0,
                "total_rows": 0,
                "refreshed_at": None,
            },
        )
        layer_entry["asset_count"] += 1
        layer_entry["ready_count"] += 1 if item["status"] == "ready" else 0
        layer_entry["total_rows"] += int(item["row_count"])
        if item["refreshed_at"] and (
            layer_entry["refreshed_at"] is None
            or item["refreshed_at"] > layer_entry["refreshed_at"]
        ):
            layer_entry["refreshed_at"] = item["refreshed_at"]

    order = ["ODS", "DW", "TDM", "ADS"]
    items = []
    for layer in order:
        row = grouped.get(layer)
        if row is None:
            continue
        asset_count = int(row["asset_count"])
        ready_count = int(row["ready_count"])
        items.append(
            {
                "asset_layer": layer,
                "asset_count": asset_count,
                "ready_count": ready_count,
                "total_rows": int(row["total_rows"]),
                "completion_rate": round(ready_count / max(1, asset_count), 4),
                "refreshed_at": row["refreshed_at"],
            }
        )

    latest_refresh = max(
        (item["refreshed_at"] for item in items if item["refreshed_at"]),
        default=None,
    )
    return {
        "total_asset_count": sum(item["asset_count"] for item in items),
        "total_ready_count": sum(item["ready_count"] for item in items),
        "total_rows": sum(item["total_rows"] for item in items),
        "refreshed_at": latest_refresh,
        "items": items,
    }


def fetch_available_dates(db: Session) -> dict[str, Any]:
    if not _table_exists(db, "meta_available_time_range"):
        return _build_fallback_dates(db)
    rows = (
        db.execute(
            text(
                """
                SELECT asset_key, min_date, max_date, available_dates, updated_at
                FROM meta_available_time_range
                """
            )
        )
        .mappings()
        .all()
    )
    lookup = {str(row["asset_key"]): row for row in rows}
    if not lookup:
        return _build_fallback_dates(db)

    summary_dates = _json_dates(lookup.get("summary_dates"))
    heatmap_dates = _json_dates(lookup.get("heatmap_dates"))
    route_dates = _json_dates(lookup.get("route_dates"))
    latest_updated = max(
        (
            row["updated_at"]
            for row in lookup.values()
            if row["updated_at"] is not None
        ),
        default=None,
    )
    return {
        "summary_dates": summary_dates,
        "heatmap_dates": heatmap_dates,
        "route_dates": route_dates,
        "default_summary_date": summary_dates[0] if summary_dates else None,
        "default_heatmap_date": heatmap_dates[0] if heatmap_dates else None,
        "default_route_date": route_dates[0] if route_dates else None,
        "refreshed_at": latest_updated.isoformat() if latest_updated else None,
    }


def fetch_latest_job_status(db: Session) -> dict[str, Any] | None:
    if not _table_exists(db, "meta_job_status"):
        return _build_fallback_latest_job(db)
    row = (
        db.execute(
            text(
                """
                SELECT
                  job_name,
                  latest_run_id,
                  status,
                  started_at,
                  finished_at,
                  message,
                  details
                FROM meta_job_status
                WHERE job_name = 'pipeline'
                """
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return _build_fallback_latest_job(db)

    return {
        "job_name": row["job_name"],
        "latest_run_id": int(row["latest_run_id"])
        if row["latest_run_id"] is not None
        else None,
        "status": row["status"],
        "started_at": row["started_at"].isoformat()
        if row["started_at"] is not None
        else None,
        "finished_at": row["finished_at"].isoformat()
        if row["finished_at"] is not None
        else None,
        "message": row["message"],
        "details": dict(row["details"] or {}),
    }


def fetch_metadata_capability(db: Session) -> dict[str, Any]:
    dates = fetch_available_dates(db)
    return {
        "route": get_route_capability(db),
        "latest_job": fetch_latest_job_status(db),
        **dates,
    }


def _build_fallback_asset_catalog(db: Session) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for asset in ASSET_CATALOG_DEFINITIONS:
        table_name = asset["source_table"]
        exists = _table_exists(db, table_name)
        row_count = (
            int(db.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one())
            if exists
            else 0
        )
        items.append(
            {
                "asset_key": asset["asset_key"],
                "display_name": asset["display_name"],
                "asset_layer": asset["asset_layer"],
                "asset_type": asset["asset_type"],
                "source_table": table_name,
                "status": "missing" if not exists else "ready" if row_count > 0 else "empty",
                "row_count": row_count,
                "refreshed_at": None,
                "description": asset["description"],
            }
        )
    return items


def _build_fallback_dates(db: Session) -> dict[str, Any]:
    summary_dates = _read_distinct_dates(
        db, "SELECT metric_date FROM daily_metrics ORDER BY metric_date"
    )
    heatmap_dates = _read_distinct_dates(
        db,
        "SELECT DISTINCT metric_date FROM heatmap_bins ORDER BY metric_date",
    )
    route_dates = _read_distinct_dates(
        db,
        "SELECT DISTINCT bucket_start::date FROM road_speed_bins ORDER BY bucket_start::date",
    )
    return {
        "summary_dates": summary_dates,
        "heatmap_dates": heatmap_dates,
        "route_dates": route_dates,
        "default_summary_date": summary_dates[0] if summary_dates else None,
        "default_heatmap_date": heatmap_dates[0] if heatmap_dates else None,
        "default_route_date": route_dates[0] if route_dates else None,
        "refreshed_at": None,
    }


def _build_fallback_latest_job(db: Session) -> dict[str, Any] | None:
    row = (
        db.execute(
            text(
                """
                SELECT id, run_type, status, started_at, finished_at, error_message, meta
                FROM ingest_runs
                WHERE run_type LIKE 'pipeline_%'
                ORDER BY id DESC
                LIMIT 1
                """
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return None
    return {
        "job_name": "pipeline",
        "latest_run_id": int(row["id"]),
        "status": row["status"],
        "started_at": row["started_at"].isoformat()
        if row["started_at"] is not None
        else None,
        "finished_at": row["finished_at"].isoformat()
        if row["finished_at"] is not None
        else None,
        "message": row["error_message"] or row["run_type"],
        "details": dict(row["meta"] or {}),
    }


def _read_distinct_dates(db: Session, query: str) -> list[str]:
    rows = db.execute(text(query)).all()
    values: list[str] = []
    for row in rows:
        if not row or row[0] is None:
            continue
        value = row[0]
        if isinstance(value, (date, datetime)):
            values.append(value.isoformat())
        else:
            values.append(str(value))
    return values


def _json_dates(row: Any) -> list[str]:
    if row is None:
        return []
    raw = row["available_dates"]
    if isinstance(raw, list):
        return [str(item) for item in raw]
    return []


def _table_exists(db: Session, table_name: str) -> bool:
    row = db.execute(
        text("SELECT to_regclass(:table_name)"),
        {"table_name": f"public.{table_name}"},
    ).first()
    return bool(row and row[0])
