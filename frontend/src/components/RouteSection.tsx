import type { Dispatch, RefObject, SetStateAction } from "react";
import type { RouteCapability, RoutePayload, RouteResult } from "../api";

const V = {
  surface: "var(--color-surface)",
  surfaceLow: "var(--color-surface-low)",
  surfaceContainer: "var(--color-surface-container)",
  border: "var(--color-border)",
  borderLight: "var(--color-border-light)",
  text: "var(--color-text)",
  textSecondary: "var(--color-text-secondary)",
  primary: "var(--color-primary)",
  danger: "var(--color-danger)",
  warning: "var(--color-warning)",
  warningLight: "var(--color-warning-light)",
  dangerLight: "var(--color-danger-light)",
  cardBg: "var(--color-surface)",
  cardBorder: "var(--color-border-light)",
  cardShadow: "0 1px 3px rgba(0,0,0,0.04)",
  inputBg: "var(--color-surface-low)",
  inputBorder: "var(--color-border)",
  btnSecondaryBg: "var(--color-surface-container)",
  btnSecondaryBorder: "var(--color-border)",
} as const;

const FONT = { heading: "'Work Sans',sans-serif", mono: "'JetBrains Mono',monospace" } as const;

const safeNum = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  return 0;
};

type RouteSectionProps = {
  capability: RouteCapability | null; capabilityError: string | null;
  routePayload: RoutePayload; setRoutePayload: Dispatch<SetStateAction<RoutePayload>>;
  routeResult: RouteResult | null; onRunRoute: () => void;
  clearRouteOnMap: () => void; clearRouteResult: () => void;
  showShortestOnMap: boolean; setShowShortestOnMap: (v: boolean) => void;
  showFastestOnMap: boolean; setShowFastestOnMap: (v: boolean) => void;
  routeOverlap: boolean; routeErrorHint: string | null;
  routePickMode: "none" | "start" | "end"; setRoutePickMode: (v: "none" | "start" | "end") => void;
  routeMapContainerRef: RefObject<HTMLDivElement | null>;
};

export function RouteSection(props: RouteSectionProps) {
  const { capability, capabilityError, routePayload, setRoutePayload, routeResult, onRunRoute, clearRouteOnMap, clearRouteResult, showShortestOnMap, setShowShortestOnMap, showFastestOnMap, setShowFastestOnMap, routeOverlap, routeErrorHint, routePickMode, setRoutePickMode, routeMapContainerRef } = props;
  const ready = capability?.ready ?? false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: V.cardBg, border: `1px solid ${V.cardBorder}`, borderRadius: 12, boxShadow: V.cardShadow, padding: "16px 24px" }}>
        <h3 style={{ margin: 0, fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, color: V.text }}>路径对比</h3>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: V.textSecondary }}>最短路 · 最快路 · 地图选点 · 路径明细查看</p>
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, color: V.textSecondary }}>
          <span>路径能力：<b style={{ color: ready ? "#34a853" : "#ea4335" }}>{ready ? "已就绪" : "未就绪"}</b></span>
          <span>边数量：{capability?.edge_count?.toLocaleString() ?? "—"}</span>
          <span>速度桶：{capability?.speed_bins_count?.toLocaleString() ?? "—"}</span>
        </div>
      </div>

      {capabilityError ? (
        <div style={{ background: V.dangerLight, borderLeft: "4px solid var(--color-danger)", borderRadius: 12, boxShadow: V.cardShadow, padding: "12px 18px", color: V.danger, fontSize: 12 }}>
          能力检查失败：{capabilityError}
        </div>
      ) : null}
      {!ready && capability?.issues?.length ? (
        <div style={{ background: V.warningLight, borderLeft: "4px solid var(--color-warning)", borderRadius: 12, boxShadow: V.cardShadow, padding: "12px 18px", color: V.warning, fontSize: 12 }}>
          {capability.issues.join("；")}
        </div>
      ) : null}
      {routeErrorHint ? (
        <div style={{ background: V.surfaceContainer, borderRadius: 12, boxShadow: V.cardShadow, padding: "12px 18px", color: V.textSecondary, fontSize: 12 }}>{routeErrorHint}</div>
      ) : null}

      <div style={{ background: V.cardBg, border: `1px solid ${V.cardBorder}`, borderRadius: 12, boxShadow: V.cardShadow, padding: "18px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px 16px", marginBottom: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600, color: V.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            起始时间
            <input type="datetime-local" value={routePayload.start_time.slice(0, 16)}
              onChange={(e) => setRoutePayload((p) => ({ ...p, start_time: e.target.value }))}
              style={{ background: V.inputBg, border: `1px solid ${V.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: V.text }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600, color: V.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            查询时间
            <input type="datetime-local" value={routePayload.query_time.slice(0, 16)}
              onChange={(e) => setRoutePayload((p) => ({ ...p, query_time: e.target.value }))}
              style={{ background: V.inputBg, border: `1px solid ${V.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: V.text }} />
          </label>
          <div />
          {(["起点纬度","起点经度","终点纬度","终点经度"] as const).map((lbl, idx) => {
            const pt = idx < 2 ? "start_point" : "end_point";
            const coord = idx % 2 === 0 ? "lat" : "lon";
            return (
              <label key={lbl} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600, color: V.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {lbl}
                <input type="number" step="0.001" value={(routePayload as any)[pt][coord]}
                  onChange={(e) => setRoutePayload((p) => ({ ...p, [pt]: { ...(p as any)[pt], [coord]: Number(e.target.value) } }))}
                  style={{ background: V.inputBg, border: `1px solid ${V.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: V.text }} />
              </label>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: V.textSecondary, margin: "0 0 12px" }}>起始时间 = 请求上下文时间；查询时间 = 命中 5 分钟速度桶。</p>
        <button onClick={onRunRoute} disabled={!ready}
          style={{ background: ready ? "var(--color-primary)" : "var(--color-border)", color: ready ? "#fff" : "var(--color-text-secondary)", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 600, fontSize: 14, cursor: ready ? "pointer" : "not-allowed", fontFamily: FONT.heading }}>
          执行路径对比
        </button>
      </div>

      <div style={{ background: V.cardBg, border: `1px solid ${V.cardBorder}`, borderRadius: 12, boxShadow: V.cardShadow, padding: "14px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 16px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: V.textSecondary }}>地图路径图层</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#2ea8ff", cursor: "pointer" }}>
          <input type="checkbox" checked={showShortestOnMap} onChange={(e) => setShowShortestOnMap(e.target.checked)} />最短
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#ef8a2f", cursor: "pointer" }}>
          <input type="checkbox" checked={showFastestOnMap} onChange={(e) => setShowFastestOnMap(e.target.checked)} />最快
        </label>
        <button onClick={clearRouteOnMap} style={{ background: V.btnSecondaryBg, color: V.text, border: `1px solid ${V.btnSecondaryBorder}`, borderRadius: 8, padding: "7px 14px", fontWeight: 500, fontSize: 12, cursor: "pointer" }}>清空图层</button>
        <button onClick={clearRouteResult} style={{ background: V.btnSecondaryBg, color: V.text, border: `1px solid ${V.btnSecondaryBorder}`, borderRadius: 8, padding: "7px 14px", fontWeight: 500, fontSize: 12, cursor: "pointer" }}>清空结果</button>

        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: V.textSecondary }}>地图选点</span>
        <button onClick={() => setRoutePickMode(routePickMode === "start" ? "none" : "start")}
          style={{ background: routePickMode === "start" ? "var(--color-primary)" : V.btnSecondaryBg, color: routePickMode === "start" ? "#fff" : V.text, border: `1px solid ${routePickMode === "start" ? "var(--color-primary)" : V.btnSecondaryBorder}`, borderRadius: 8, padding: "7px 14px", fontWeight: 500, fontSize: 12, cursor: "pointer" }}>
          选择起点
        </button>
        <button onClick={() => setRoutePickMode(routePickMode === "end" ? "none" : "end")}
          style={{ background: routePickMode === "end" ? "var(--color-primary)" : V.btnSecondaryBg, color: routePickMode === "end" ? "#fff" : V.text, border: `1px solid ${routePickMode === "end" ? "var(--color-primary)" : V.btnSecondaryBorder}`, borderRadius: 8, padding: "7px 14px", fontWeight: 500, fontSize: 12, cursor: "pointer" }}>
          选择终点
        </button>
        <span style={{ fontSize: 11, color: V.textSecondary }}>
          {routePickMode === "none" ? "选择模式后点击地图" : routePickMode === "start" ? "点击地图选择起点" : "点击地图选择终点"}
        </span>
      </div>

      <div style={{ background: V.cardBg, border: `1px solid ${V.cardBorder}`, borderRadius: 12, boxShadow: V.cardShadow, overflow: "hidden", padding: 0, flex: 1, minHeight: 420 }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--color-border-light)", fontSize: 12, fontWeight: 600, color: V.textSecondary }}>
          路径对比地图 (MapLibre GL)
        </div>
        <div ref={routeMapContainerRef} style={{ width: "100%", height: "calc(100vh - 520px)", minHeight: 360 }} />
      </div>

      {routeOverlap ? <div style={{ background: V.cardBg, border: `1px solid ${V.cardBorder}`, borderRadius: 12, boxShadow: V.cardShadow, padding: "12px 18px", textAlign: "center", fontSize: 12, color: V.textSecondary }}>当前查询时间下，最短路径与最快路径一致。</div> : null}

      {routeResult ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
          {(["shortest_route", "fastest_route"] as const).map((key, idx) => {
            const route = routeResult[key];
            const edges = route?.edges ?? [];
            return (
              <div key={key} style={{ background: V.cardBg, border: `1px solid ${V.cardBorder}`, borderRadius: 12, boxShadow: V.cardShadow, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
                <h5 style={{ margin: 0, fontFamily: FONT.heading, fontSize: 14, fontWeight: 600, color: idx === 0 ? "#2ea8ff" : "#ef8a2f" }}>
                  {idx === 0 ? "最短路径" : "最快路径"}
                </h5>
                <div style={{ display: "flex", gap: 24, fontSize: 13, color: V.text }}>
                  <span style={{ fontFamily: FONT.mono }}>里程 <b>{route?.distance_m?.toFixed(0) ?? "—"} m</b></span>
                  <span style={{ fontFamily: FONT.mono }}>耗时 <b>{route?.estimated_time_s?.toFixed(0) ?? "—"} s</b></span>
                </div>
                <div style={{ maxHeight: 260, overflow: "auto", borderTop: "1px solid var(--color-border-light)", paddingTop: 8, marginTop: 4 }}>
                  <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", color: V.text }}>
                    <thead>
                      <tr style={{ color: V.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>序号</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>边ID</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>道路</th>
                        <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>距离(m)</th>
                        <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>耗时(s)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {edges.map((edge) => (
                        <tr key={`${key}-${edge.seq}-${edge.edge_id}`}
                          style={{ borderTop: "1px solid var(--color-border-light)", fontFamily: FONT.mono }}>
                          <td style={{ padding: "6px 8px" }}>#{edge.seq}</td>
                          <td style={{ padding: "6px 8px" }}>{edge.edge_id}</td>
                          <td style={{ padding: "6px 8px" }}>{edge.road_id ?? "—"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }}>{safeNum(edge.distance_m).toFixed(0)}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }}>{safeNum(edge.estimated_time_s).toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
