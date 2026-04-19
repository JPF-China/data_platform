from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas import DepartureWindowRequest, RouteCompareRequest
from app.services.route_search_service import snap_to_bucket, to_naive_datetime
from app.services.route_service import compute_route_comparison


def _table_exists(db: Session, table_name: str) -> bool:
    row = db.execute(
        text("SELECT to_regclass(:table_name)"),
        {"table_name": f"public.{table_name}"},
    ).first()
    return bool(row and row[0])


def ensure_recommendation_schema(db: Session) -> None:
    db.execute(
        text(
            """
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
    )
    db.flush()


def recommend_route(
    db: Session,
    payload: RouteCompareRequest,
    *,
    persist: bool = True,
) -> dict[str, Any]:
    ensure_recommendation_schema(db)
    compare, meta = compute_route_comparison(db, payload, persist=False)

    shortest = compare.shortest_route
    fastest = compare.fastest_route
    time_saved_s = round(shortest.estimated_time_s - fastest.estimated_time_s, 3)
    distance_delta_m = round(fastest.distance_m - shortest.distance_m, 3)
    used_dynamic_speed = bool(meta["used_dynamic_speed"])
    route_overlap = bool(meta["route_overlap"])

    recommended_strategy = "shortest"
    summary = "推荐保留当前主路径。"
    if used_dynamic_speed and not route_overlap and time_saved_s > 15:
        recommended_strategy = "fastest"
        summary = f"推荐最快路径，预计可节省 {time_saved_s:.1f} 秒。"
    elif route_overlap:
        recommended_strategy = "shortest"
        summary = "最短路与最快路一致，推荐沿用主路径。"
    elif not used_dynamic_speed:
        recommended_strategy = "shortest"
        summary = "当前时间桶缺少动态速度数据，已回退到静态权重策略。"
    elif distance_delta_m > 0 and time_saved_s <= 15:
        recommended_strategy = "shortest"
        summary = "两条路径耗时差异较小，推荐更短的主路径。"
    else:
        recommended_strategy = "fastest"
        summary = "推荐最快路径，以时间收益优先。"

    recommended_route = fastest if recommended_strategy == "fastest" else shortest
    alternative_route = shortest if recommended_strategy == "fastest" else fastest
    reasons = _build_route_reasons(
        used_dynamic_speed=used_dynamic_speed,
        route_overlap=route_overlap,
        time_saved_s=time_saved_s,
        distance_delta_m=distance_delta_m,
        recommended_strategy=recommended_strategy,
    )

    result = {
        "start_time": compare.start_time,
        "query_time": compare.query_time,
        "query_bucket_start": compare.query_bucket_start,
        "recommended_strategy": recommended_strategy,
        "used_dynamic_speed": used_dynamic_speed,
        "fallback_mode": str(meta["fallback_mode"]),
        "summary": summary,
        "reasons": reasons,
        "time_saved_s": time_saved_s,
        "distance_delta_m": distance_delta_m,
        "recommended_route": recommended_route.model_dump(),
        "alternative_route": alternative_route.model_dump(),
        "shortest_route": shortest.model_dump(),
        "fastest_route": fastest.model_dump(),
    }
    if persist:
        _persist_recommendation(
            db,
            recommendation_type="route",
            payload=payload,
            query_time=to_naive_datetime(payload.query_time),
            query_bucket_start=to_naive_datetime(
                datetime.fromisoformat(compare.query_bucket_start)
            ),
            recommended_strategy=recommended_strategy,
            summary=summary,
            explanation=reasons,
            recommended_payload=result,
            audit_meta={
                "used_dynamic_speed": used_dynamic_speed,
                "fallback_mode": meta["fallback_mode"],
            },
        )
        db.commit()
    return result


def recommend_departure_window(
    db: Session,
    payload: DepartureWindowRequest,
    *,
    persist: bool = True,
) -> dict[str, Any]:
    ensure_recommendation_schema(db)
    candidate_times = _candidate_departure_times(db, payload)
    options: list[dict[str, Any]] = []

    for query_time in candidate_times:
        compare_payload = RouteCompareRequest(
            start_time=query_time,
            query_time=query_time,
            start_point=payload.start_point,
            end_point=payload.end_point,
        )
        try:
            rec = recommend_route(db, compare_payload, persist=False)
        except ValueError:
            continue
        score = float(rec["recommended_route"]["estimated_time_s"]) + (
            0 if rec["used_dynamic_speed"] else 45
        )
        options.append(
            {
                "start_time": query_time.isoformat(),
                "query_bucket_start": rec["query_bucket_start"],
                "recommended_strategy": rec["recommended_strategy"],
                "estimated_time_s": float(
                    rec["recommended_route"]["estimated_time_s"]
                ),
                "used_dynamic_speed": bool(rec["used_dynamic_speed"]),
                "score": round(score, 3),
                "summary": rec["summary"],
            }
        )

    if not options:
        raise ValueError("No departure window candidates produced a traversable route")

    options.sort(
        key=lambda item: (item["score"], item["start_time"], item["recommended_strategy"])
    )
    best = options[0]
    summary = (
        f"推荐在 {best['start_time'][11:16]} 左右出发，"
        f"预计耗时 {best['estimated_time_s']:.1f} 秒。"
    )
    result = {
        "travel_date": payload.travel_date.isoformat(),
        "recommended_start_time": best["start_time"],
        "recommended_query_bucket_start": best["query_bucket_start"],
        "summary": summary,
        "options": options[:5],
    }
    if persist:
        _persist_recommendation(
            db,
            recommendation_type="departure_window",
            payload=payload,
            query_time=datetime.fromisoformat(best["start_time"]),
            query_bucket_start=datetime.fromisoformat(best["query_bucket_start"]),
            recommended_strategy=best["recommended_strategy"],
            summary=summary,
            explanation=[item["summary"] for item in options[:3]],
            recommended_payload=result,
            audit_meta={"option_count": len(options)},
        )
        db.commit()
    return result


def recommend_congestion_avoidance(
    db: Session,
    payload: RouteCompareRequest,
    *,
    persist: bool = True,
) -> dict[str, Any]:
    ensure_recommendation_schema(db)
    current = recommend_route(db, payload, persist=False)
    query_time = to_naive_datetime(payload.query_time)
    bucket_start = snap_to_bucket(query_time)
    current_level = _fetch_strategy_level(db, query_time.date(), bucket_start)

    window_payload = DepartureWindowRequest(
        travel_date=query_time.date(),
        start_point=payload.start_point,
        end_point=payload.end_point,
        window_start_hour=max(0, query_time.hour - 1),
        window_end_hour=min(23, query_time.hour + 1),
        step_minutes=15,
    )
    window_result = recommend_departure_window(db, window_payload, persist=False)
    current_estimated = float(current["recommended_route"]["estimated_time_s"])
    best_estimated = float(window_result["options"][0]["estimated_time_s"])
    time_gain_s = round(current_estimated - best_estimated, 3)

    if (
        window_result["recommended_start_time"][:16] != query_time.isoformat()[:16]
        and time_gain_s > 30
    ):
        recommended_action = "shift_departure_window"
        summary = (
            f"建议把出发时间调整到 {window_result['recommended_start_time'][11:16]}，"
            f"预计可减少 {time_gain_s:.1f} 秒。"
        )
        recommended_query_time = window_result["recommended_start_time"]
        suggested_strategy = window_result["options"][0]["recommended_strategy"]
    elif current["recommended_strategy"] == "fastest":
        recommended_action = "use_fastest_route_now"
        summary = "建议当前时段选择最快路径，以规避局部拥堵。"
        recommended_query_time = current["query_time"]
        suggested_strategy = "fastest"
    else:
        recommended_action = "keep_current_plan"
        summary = "当前时段整体可接受，建议保持当前计划。"
        recommended_query_time = current["query_time"]
        suggested_strategy = current["recommended_strategy"]

    reasons = [
        f"当前网络状态：{current_level or 'unknown'}",
        current["summary"],
        window_result["summary"],
    ]
    result = {
        "current_query_time": current["query_time"],
        "current_bucket_start": current["query_bucket_start"],
        "current_network_level": current_level,
        "recommended_action": recommended_action,
        "recommended_query_time": recommended_query_time,
        "recommended_strategy": suggested_strategy,
        "summary": summary,
        "reasons": reasons,
    }
    if persist:
        _persist_recommendation(
            db,
            recommendation_type="congestion_avoidance",
            payload=payload,
            query_time=query_time,
            query_bucket_start=bucket_start,
            recommended_strategy=suggested_strategy,
            summary=summary,
            explanation=reasons,
            recommended_payload=result,
            audit_meta={"current_level": current_level, "time_gain_s": time_gain_s},
        )
        db.commit()
    return result


def _candidate_departure_times(
    db: Session,
    payload: DepartureWindowRequest,
) -> list[datetime]:
    strategy_rows: list[datetime] = []
    if _table_exists(db, "ads_route_strategy"):
        rows = (
            db.execute(
                text(
                    """
                    SELECT bucket_start
                    FROM ads_route_strategy
                    WHERE strategy_date = :strategy_date
                      AND EXTRACT(HOUR FROM bucket_start) BETWEEN :start_hour AND :end_hour
                    ORDER BY
                      CASE recommendation_level
                        WHEN 'smooth' THEN 1
                        WHEN 'balanced' THEN 2
                        ELSE 3
                      END,
                      avg_speed_kmh DESC NULLS LAST,
                      bucket_start
                    LIMIT 8
                    """
                ),
                {
                    "strategy_date": payload.travel_date,
                    "start_hour": payload.window_start_hour,
                    "end_hour": payload.window_end_hour,
                },
            )
            .all()
        )
        strategy_rows = [row[0] for row in rows if row and row[0] is not None]

    if strategy_rows:
        return strategy_rows

    current = datetime.combine(
        payload.travel_date, time(hour=payload.window_start_hour, minute=0)
    )
    end_time = datetime.combine(
        payload.travel_date, time(hour=payload.window_end_hour, minute=0)
    )
    values: list[datetime] = []
    while current <= end_time:
        values.append(current)
        current += timedelta(minutes=payload.step_minutes)
    return values


def _fetch_strategy_level(
    db: Session,
    strategy_date: date,
    bucket_start: datetime,
) -> str | None:
    if not _table_exists(db, "ads_route_strategy"):
        return None
    row = db.execute(
        text(
            """
            SELECT recommendation_level
            FROM ads_route_strategy
            WHERE strategy_date = :strategy_date
              AND bucket_start = :bucket_start
            """
        ),
        {"strategy_date": strategy_date, "bucket_start": bucket_start},
    ).first()
    return str(row[0]) if row and row[0] is not None else None


def _build_route_reasons(
    *,
    used_dynamic_speed: bool,
    route_overlap: bool,
    time_saved_s: float,
    distance_delta_m: float,
    recommended_strategy: str,
) -> list[str]:
    reasons: list[str] = []
    if used_dynamic_speed:
        reasons.append("已命中动态速度桶，推荐基于历史时段速度特征。")
    else:
        reasons.append("未命中动态速度桶，已回退为静态路网权重。")

    if route_overlap:
        reasons.append("最短路与最快路一致，说明当前路径选择稳定。")
    elif time_saved_s > 0:
        reasons.append(f"最快路径相较最短路径可节省 {time_saved_s:.1f} 秒。")
    else:
        reasons.append("两条路径时间差异很小，时间收益不明显。")

    if distance_delta_m > 0:
        reasons.append(f"时间更优的路径会增加约 {distance_delta_m:.1f} 米。")
    elif distance_delta_m < 0:
        reasons.append(f"推荐路径比备选路径更短约 {abs(distance_delta_m):.1f} 米。")

    reasons.append(
        "推荐结论：优先选择最快路径。"
        if recommended_strategy == "fastest"
        else "推荐结论：优先选择更稳妥的主路径。"
    )
    return reasons


def _persist_recommendation(
    db: Session,
    *,
    recommendation_type: str,
    payload: Any,
    query_time: datetime,
    query_bucket_start: datetime | None,
    recommended_strategy: str,
    summary: str,
    explanation: list[str],
    recommended_payload: dict[str, Any],
    audit_meta: dict[str, Any],
) -> None:
    travel_date = (
        payload.travel_date
        if hasattr(payload, "travel_date")
        else query_time.date()
    )
    start_point = getattr(payload, "start_point", None)
    end_point = getattr(payload, "end_point", None)
    db.execute(
        text(
            """
            INSERT INTO ads_route_recommendation (
              recommendation_type,
              travel_date,
              query_time,
              query_bucket_start,
              start_point,
              end_point,
              recommended_strategy,
              summary,
              explanation,
              recommended_payload,
              audit_meta
            ) VALUES (
              :recommendation_type,
              :travel_date,
              :query_time,
              :query_bucket_start,
              CASE
                WHEN :start_lon IS NOT NULL AND :start_lat IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint(:start_lon, :start_lat), 4326)
                ELSE NULL
              END,
              CASE
                WHEN :end_lon IS NOT NULL AND :end_lat IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint(:end_lon, :end_lat), 4326)
                ELSE NULL
              END,
              :recommended_strategy,
              :summary,
              CAST(:explanation AS jsonb),
              CAST(:recommended_payload AS jsonb),
              CAST(:audit_meta AS jsonb)
            )
            """
        ),
        {
            "recommendation_type": recommendation_type,
            "travel_date": travel_date,
            "query_time": query_time,
            "query_bucket_start": query_bucket_start,
            "start_lon": getattr(start_point, "lon", None),
            "start_lat": getattr(start_point, "lat", None),
            "end_lon": getattr(end_point, "lon", None),
            "end_lat": getattr(end_point, "lat", None),
            "recommended_strategy": recommended_strategy,
            "summary": summary,
            "explanation": json.dumps(explanation, ensure_ascii=False),
            "recommended_payload": json.dumps(recommended_payload, ensure_ascii=False),
            "audit_meta": json.dumps(audit_meta, ensure_ascii=False),
        },
    )
