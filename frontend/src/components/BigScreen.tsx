import { useState, useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RiskSummaryRow } from "../api";
import { fetchRiskSummary, fetchAssets } from "../api";

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "";
const MAP_TILES = (import.meta as any).env?.VITE_MAP_TILES ?? "https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";

async function request<T>(url: string): Promise<T> {
  const r = await fetch(`${API_BASE}${url}`);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

interface KpiData { totalTrips: number; totalVehicles: number; totalDistKm: number; alertCount: number; fatigueDrivers: number; severeFatigue: number; abnormalEvents: number; }
interface AssetLayer { layer: string; tables: number; rows: number; }

export function BigScreen() {
  const [time, setTime] = useState("");
  const [kpi, setKpi] = useState<KpiData>({ totalTrips: 0, totalVehicles: 0, totalDistKm: 0, alertCount: 0, fatigueDrivers: 0, severeFatigue: 0, abnormalEvents: 0 });
  const [assets, setAssets] = useState<AssetLayer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [reportRaw, riskRaw, assetRaw] = await Promise.all([
        request<{ items: any[] }>("/report/daily?limit=5").catch(() => ({ items: [] })),
        fetchRiskSummary().catch(() => [] as RiskSummaryRow[]),
        fetchAssets().catch(() => []),
      ]);
      const reports = reportRaw.items ?? [];
      const latest = reports[0];
      const risk = (riskRaw as RiskSummaryRow[])[0];
      setKpi({
        totalTrips: latest?.total_trips ?? 0,
        totalVehicles: latest?.total_vehicles ?? 0,
        totalDistKm: latest?.total_distance_km ?? 0,
        alertCount: (risk?.fatigue_drivers ?? 0) + (risk?.abnormal_running_events ?? 0),
        fatigueDrivers: risk?.fatigue_drivers ?? 0,
        severeFatigue: risk?.severe_fatigue_drivers ?? 0,
        abnormalEvents: risk?.abnormal_running_events ?? 0,
      });
      const layers = ["DWD", "DWS", "ADS"] as const;
      const assetLayers = layers.map((l) => {
        const la = (assetRaw as any[]).filter((a: any) => a.asset_layer === l);
        return { layer: l, tables: la.length, rows: la.reduce((s: number, a: any) => s + (a.row_count ?? 0), 0) };
      });
      setAssets(assetLayers);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { loadData(); intervalRef.current = setInterval(loadData, 30000); return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, [loadData]);
  useEffect(() => { const tick = () => setTime(new Date().toLocaleString("zh-CN", { hour12: false })); tick(); const t = setInterval(tick, 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: { version: 8, sources: { osm: { type: "raster", tiles: MAP_TILES.split(",").map((u: string) => u.trim()), tileSize: 256, attribution: "&copy; OpenStreetMap" } }, layers: [{ id: "osm", type: "raster", source: "osm" }] },
      center: [126.63, 45.75],
      zoom: 11,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-left");
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const fmt = (n: number) => n.toLocaleString();
  const fmtKm = (n: number) => (n / 1000).toFixed(0) + " km";

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Inter',system-ui,sans-serif", color: "#e8eaed", background: "#0f1923", overflow: "hidden" }}>
      {/* top bar */}
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: "0.02em" }}>哈尔滨车辆轨迹分析 · 大屏监控</span>
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: "rgba(138,180,248,0.15)", color: "#8ab4f8" }}>哈尔滨</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#34a853" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#34a853", animation: "pulse 2s infinite" }} />系统在线</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: "#9aa0a6" }}>{time}</span>
        </div>
      </div>

      {/* error */}
      {error ? <div style={{ padding: "8px 28px", background: "rgba(234,67,53,0.15)", color: "#f28b82", fontSize: 12, flexShrink: 0 }}>⚠ {error}（30s 后自动重试）</div> : null}

      {/* main */}
      <div style={{ flex: 1, display: "flex", gap: 16, padding: "16px 28px", overflow: "hidden" }}>
        {/* left: KPI + map */}
        <div style={{ flex: "0 0 67%", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, flexShrink: 0 }}>
            {[
              { label: "总行程", value: fmt(kpi.totalTrips), sub: `车辆 ${fmt(kpi.totalVehicles)}`, color: "#8ab4f8" },
              { label: "总里程", value: fmtKm(kpi.totalDistKm * 1000), sub: `日均 ${fmtKm((kpi.totalDistKm * 1000) / 5)}`, color: "#34a853" },
              { label: "活跃告警", value: String(kpi.alertCount), sub: `疲劳 ${kpi.fatigueDrivers} · 异常 ${kpi.abnormalEvents}`, color: "#f9ab00" },
              { label: "严重疲劳", value: String(kpi.severeFatigue), sub: `需重点关注`, color: "#ea4335" },
            ].map((c, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9aa0a6", fontWeight: 600 }}>{c.label}</span>
                <span style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 30, fontWeight: 700, color: c.color }}>{c.value}</span>
                <span style={{ fontSize: 11, color: "#5f6368" }}>{c.sub}</span>
              </div>
            ))}
          </div>

          {/* map */}
          <div style={{ flex: 1, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", minHeight: 0 }}>
            <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />
          </div>
        </div>

        {/* right panes */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 280 }}>
          {[
            { title: "风险实时监测", rows: [{ label: "疲劳驾驶", value: fmt(kpi.fatigueDrivers), color: "#f9ab00" }, { label: "严重疲劳", value: fmt(kpi.severeFatigue), color: "#ea4335" }, { label: "异常运行", value: fmt(kpi.abnormalEvents), color: "#ea4335" }] },
            { title: "数据资产状态", rows: assets.map((a) => ({ label: `${a.layer}层`, value: `${a.tables}表 · ${a.rows.toLocaleString()}行`, color: "#8ab4f8" })) },
          ].map((card, ci) => (
            <div key={ci} style={{ flex: ci === 1 ? 1 : "none", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
              <h3 style={{ margin: 0, fontFamily: "'Work Sans',sans-serif", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}><span style={{ display: "block", width: 3, height: 14, borderRadius: 2, background: "#8ab4f8" }} />{card.title}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
                {card.rows.map((r, ri) => (
                  <div key={ri} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 6, background: "rgba(255,255,255,0.03)" }}>
                    <span style={{ fontSize: 12 }}>{r.label}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 600, color: r.color }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* bottom bar */}
      <div style={{ height: 30, display: "flex", alignItems: "center", justifyContent: "center", gap: 32, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 10, color: "#5f6368", flexShrink: 0 }}>
        <span>数据: 2015-01-03 ~ 2015-01-07</span>
        <span>PostgreSQL + PostGIS + pgRouting</span>
        <span>FastAPI v0.1.0 · React + MapLibre GL</span>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
