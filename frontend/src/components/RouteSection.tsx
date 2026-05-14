import type { Dispatch, RefObject, SetStateAction } from "react";
import type { RouteCapability, RoutePayload, RouteResult } from "../api";
import { SurfaceCard, SectionShell } from "./Ui";

type RouteSectionProps = {
  capability: RouteCapability | null;
  capabilityError: string | null;
  routePayload: RoutePayload;
  setRoutePayload: Dispatch<SetStateAction<RoutePayload>>;
  routeResult: RouteResult | null;
  onRunRoute: () => void;
  clearRouteOnMap: () => void;
  clearRouteResult: () => void;
  showShortestOnMap: boolean;
  setShowShortestOnMap: (value: boolean) => void;
  showFastestOnMap: boolean;
  setShowFastestOnMap: (value: boolean) => void;
  routeOverlap: boolean;
  routeErrorHint: string | null;
  routePickMode: "none" | "start" | "end";
  setRoutePickMode: (value: "none" | "start" | "end") => void;
  routeMapContainerRef: RefObject<HTMLDivElement | null>;
};

const safeNum = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

export function RouteSection(props: RouteSectionProps) {
  const {
    capability,
    capabilityError,
    routePayload,
    setRoutePayload,
    routeResult,
    onRunRoute,
    clearRouteOnMap,
    clearRouteResult,
    showShortestOnMap,
    setShowShortestOnMap,
    showFastestOnMap,
    setShowFastestOnMap,
    routeOverlap,
    routeErrorHint,
    routePickMode,
    setRoutePickMode,
    routeMapContainerRef,
  } = props;

  return (
    <SectionShell title="路径对比" description="支持最短路、最快路、地图选点与路径明细查看">
      <p className="capability-line">
        路径能力：{capability?.ready ? "已就绪" : "未就绪"}
        {capability?.edge_count !== undefined ? ` | 边数量：${capability.edge_count.toLocaleString()}` : ""}
        {capability?.speed_bins_count !== undefined ? ` | 速度桶：${capability.speed_bins_count.toLocaleString()}` : ""}
      </p>
      {capabilityError ? <div className="route-capability-issues">能力检查失败：{capabilityError}</div> : null}
      {!capability?.ready && capability?.issues?.length ? <div className="route-capability-issues">{capability.issues.join("; ")}</div> : null}
      {routeErrorHint ? <div className="loading">{routeErrorHint}</div> : null}

      <div className="inputs">
        <label>
          起始时间
          <input type="datetime-local" value={routePayload.start_time.slice(0, 16)} onChange={(e) => setRoutePayload((prev) => ({ ...prev, start_time: e.target.value }))} />
        </label>
        <label>
          查询时间
          <input type="datetime-local" value={routePayload.query_time.slice(0, 16)} onChange={(e) => setRoutePayload((prev) => ({ ...prev, query_time: e.target.value }))} />
        </label>
        <label>
          起点纬度
          <input type="number" value={routePayload.start_point.lat} onChange={(e) => setRoutePayload((prev) => ({ ...prev, start_point: { ...prev.start_point, lat: Number(e.target.value) } }))} />
        </label>
        <label>
          起点经度
          <input type="number" value={routePayload.start_point.lon} onChange={(e) => setRoutePayload((prev) => ({ ...prev, start_point: { ...prev.start_point, lon: Number(e.target.value) } }))} />
        </label>
        <label>
          终点纬度
          <input type="number" value={routePayload.end_point.lat} onChange={(e) => setRoutePayload((prev) => ({ ...prev, end_point: { ...prev.end_point, lat: Number(e.target.value) } }))} />
        </label>
        <label>
          终点经度
          <input type="number" value={routePayload.end_point.lon} onChange={(e) => setRoutePayload((prev) => ({ ...prev, end_point: { ...prev.end_point, lon: Number(e.target.value) } }))} />
        </label>
      </div>

      <p className="route-time-tip">
        `起始时间` 表示请求上下文时间；`查询时间` 用于命中 5 分钟速度桶。当查询时间变化时，最快路径可能变化。
      </p>

      <button className="primary-btn" onClick={onRunRoute} disabled={!capability?.ready}>
        执行路径对比
      </button>

      <div className="route-map-controls">
        <span className="legend-title">地图路径图层</span>
        <label className="legend-item shortest">
          <input type="checkbox" checked={showShortestOnMap} onChange={(e) => setShowShortestOnMap(e.target.checked)} />
          最短路径（青色虚线）
        </label>
        <label className="legend-item fastest">
          <input type="checkbox" checked={showFastestOnMap} onChange={(e) => setShowFastestOnMap(e.target.checked)} />
          最快路径（橙色实线）
        </label>
        <button type="button" className="secondary-btn" onClick={clearRouteOnMap}>清空路径图层</button>
        <button type="button" className="secondary-btn" onClick={clearRouteResult}>清空路径结果</button>
      </div>

      <div className="route-pick-controls">
        <span className="legend-title">地图选点</span>
        <button type="button" className={`secondary-btn ${routePickMode === "start" ? "active-mode" : ""}`} onClick={() => setRoutePickMode(routePickMode === "start" ? "none" : "start")}>选择起点</button>
        <button type="button" className={`secondary-btn ${routePickMode === "end" ? "active-mode" : ""}`} onClick={() => setRoutePickMode(routePickMode === "end" ? "none" : "end")}>选择终点</button>
        <span className="pick-tip">
          {routePickMode === "none" ? "请先选择模式，再点击地图自动回填坐标" : routePickMode === "start" ? "正在选择起点：请点击地图" : "正在选择终点：请点击地图"}
        </span>
      </div>

      <div className="map-wrap">
        <div className="map-head">路径对比地图（MapLibre GL）</div>
        <div ref={routeMapContainerRef} className="map-canvas" />
      </div>

      {routeOverlap ? <p className="route-overlap-tip">当前查询时间下，最短路径与最快路径一致。</p> : null}

      {routeResult ? (
        <div className="route-result-grid">
          <SurfaceCard title="最短路径">
            <p>总里程：{(routeResult.shortest_route?.distance_m ?? 0).toFixed(2)} m</p>
            <p>总耗时：{(routeResult.shortest_route?.estimated_time_s ?? 0).toFixed(2)} s</p>
            <div className="route-edges">
              {(routeResult.shortest_route?.edges ?? []).map((edge) => (
                <div key={`short-${edge.seq}-${edge.edge_id}`} className="route-edge-row" title={`道路=${edge.road_id ?? "未知"}, 分段里程=${edge.distance_m.toFixed(2)}m, 分段耗时=${edge.estimated_time_s.toFixed(2)}s, 累计里程=${edge.cumulative_distance_m.toFixed(2)}m, 累计耗时=${edge.cumulative_time_s.toFixed(2)}s`}>
                  <span>#{edge.seq}</span><span>边 {edge.edge_id}</span><span>道路 {edge.road_id ?? "-"}</span><span>{safeNum(edge.distance_m).toFixed(1)} m</span><span>{safeNum(edge.estimated_time_s).toFixed(1)} s</span>
                </div>
              ))}
            </div>
          </SurfaceCard>
          <SurfaceCard title="最快路径">
            <p>总里程：{(routeResult.fastest_route?.distance_m ?? 0).toFixed(2)} m</p>
            <p>总耗时：{(routeResult.fastest_route?.estimated_time_s ?? 0).toFixed(2)} s</p>
            <div className="route-edges">
              {(routeResult.fastest_route?.edges ?? []).map((edge) => (
                <div key={`fast-${edge.seq}-${edge.edge_id}`} className="route-edge-row" title={`道路=${edge.road_id ?? "未知"}, 分段里程=${edge.distance_m.toFixed(2)}m, 分段耗时=${edge.estimated_time_s.toFixed(2)}s, 累计里程=${edge.cumulative_distance_m.toFixed(2)}m, 累计耗时=${edge.cumulative_time_s.toFixed(2)}s`}>
                  <span>#{edge.seq}</span><span>边 {edge.edge_id}</span><span>道路 {edge.road_id ?? "-"}</span><span>{safeNum(edge.distance_m).toFixed(1)} m</span><span>{safeNum(edge.estimated_time_s).toFixed(1)} s</span>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>
      ) : null}
    </SectionShell>
  );
}
