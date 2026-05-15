import type { RefObject } from "react";

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
  cardBg: "var(--color-surface)",
  cardBorder: "var(--color-border-light)",
  cardShadow: "0 1px 3px rgba(0,0,0,0.04)",
  inputBg: "var(--color-surface-low)",
  inputBorder: "var(--color-border)",
  btnSecondaryBg: "var(--color-surface-container)",
  btnSecondaryBorder: "var(--color-border)",
  btnPrimaryBg: "var(--color-primary)",
} as const;

const FONT = { heading: "'Work Sans',sans-serif" } as const;

type HeatmapSectionProps = {
  selectedDate: string; setSelectedDate: (v: string) => void;
  bucketIndex: number; setBucketIndex: (v: number) => void;
  buckets: string[];
  isPlaying: boolean; setIsPlaying: (v: boolean) => void;
  showHeatmapOnMap: boolean;
  onClearHeatmap: () => void; onRestoreHeatmap: () => void;
  vehicleId: string; setVehicleId: (v: string) => void;
  vehPathLoading: boolean; onLoadVehiclePath: () => void;
  vehPath: unknown[] | null; onClearVehiclePath: () => void;
  onZoomToBbox: () => void; onResetBbox: () => void;
  pathMode?: boolean;
  heatMapContainerRef: RefObject<HTMLDivElement | null>;
};

export function HeatmapSection(props: HeatmapSectionProps) {
  const { selectedDate, setSelectedDate, bucketIndex, setBucketIndex, buckets, isPlaying, setIsPlaying, showHeatmapOnMap, onClearHeatmap, onRestoreHeatmap, vehicleId, setVehicleId, vehPathLoading, onLoadVehiclePath, vehPath, onClearVehiclePath, onZoomToBbox, onResetBbox, pathMode = false, heatMapContainerRef } = props;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: V.cardBg, border: `1px solid ${V.cardBorder}`, borderRadius: 12, boxShadow: V.cardShadow, padding: "16px 24px" }}>
        <h3 style={{ margin: 0, fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, color: V.text }}>热力回放</h3>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: V.textSecondary }}>道路流量时间桶回放、车辆路径叠加、框选筛选</p>
      </div>

      <div style={{ background: V.cardBg, border: `1px solid ${V.cardBorder}`, borderRadius: 12, boxShadow: V.cardShadow, padding: "14px 20px", display: "flex", flexWrap: "wrap", gap: "10px 16px", alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600, color: V.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          日期
          <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            style={{ background: V.inputBg, border: `1px solid ${V.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: V.text }}>
            {["2015-01-03","2015-01-04","2015-01-05","2015-01-06","2015-01-07"].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600, color: V.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          时间桶
          <input type="number" min={0} max={Math.max(0, buckets.length - 1)} value={bucketIndex}
            onChange={(e) => setBucketIndex(Number(e.target.value))}
            style={{ width: 70, background: V.inputBg, border: `1px solid ${V.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: V.text }} />
        </label>
        <button onClick={() => setIsPlaying(!isPlaying)}
          style={{ background: isPlaying ? V.danger : V.btnPrimaryBg, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          {isPlaying ? "⏸ 暂停" : "▶ 播放"}
        </button>
        <button onClick={onZoomToBbox}
          style={{ background: V.btnSecondaryBg, color: V.text, border: `1px solid ${V.btnSecondaryBorder}`, borderRadius: 8, padding: "8px 14px", fontWeight: 500, fontSize: 12, cursor: "pointer" }}>
          框选范围
        </button>
        <button onClick={onResetBbox}
          style={{ background: V.btnSecondaryBg, color: V.text, border: `1px solid ${V.btnSecondaryBorder}`, borderRadius: 8, padding: "8px 14px", fontWeight: 500, fontSize: 12, cursor: "pointer" }}>
          重置范围
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: "rgba(26,115,232,0.1)", color: "#1a73e8" }}>畅通</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: "rgba(197,85,0,0.1)", color: "#c55500" }}>繁忙</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: "rgba(234,67,53,0.1)", color: "#ea4335" }}>拥堵</span>
          <button onClick={showHeatmapOnMap ? onClearHeatmap : onRestoreHeatmap}
            style={{ background: V.btnSecondaryBg, color: V.text, border: `1px solid ${V.btnSecondaryBorder}`, borderRadius: 8, padding: "8px 14px", fontWeight: 500, fontSize: 12, cursor: "pointer" }}>
            {showHeatmapOnMap ? "清空热力图" : "恢复热力图"}
          </button>
        </div>
      </div>

      <div style={{ background: V.cardBg, border: `1px solid ${V.cardBorder}`, borderRadius: 12, boxShadow: V.cardShadow, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <input type="text" placeholder="输入车辆ID查看路径..." value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          style={{ flex: 1, background: V.inputBg, border: `1px solid ${V.inputBorder}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, maxWidth: 260, color: V.text }} />
        <button onClick={onLoadVehiclePath} disabled={vehPathLoading}
          style={{ background: V.btnPrimaryBg, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: vehPathLoading ? 0.6 : 1 }}>
          {vehPathLoading ? "加载中..." : "查看路径"}
        </button>
        {vehPath ? <button onClick={onClearVehiclePath} style={{ background: V.btnSecondaryBg, color: V.text, border: `1px solid ${V.btnSecondaryBorder}`, borderRadius: 8, padding: "8px 14px", fontWeight: 500, fontSize: 12, cursor: "pointer" }}>清空路径</button> : null}
        {vehPath ? <span style={{ fontSize: 12, color: V.textSecondary }}>{vehPath.length} 段路径</span> : null}
      </div>

      <div style={{ background: V.cardBg, border: `1px solid ${V.cardBorder}`, borderRadius: 12, boxShadow: V.cardShadow, overflow: "hidden", padding: 0, flex: 1, minHeight: 500 }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--color-border-light)", fontSize: 12, fontWeight: 600, color: V.textSecondary }}>
          {pathMode ? "车辆路径回放 (MapLibre GL)" : "道路流量热力图 (MapLibre GL)"} · {buckets[bucketIndex] ?? "—"}
        </div>
        <div ref={heatMapContainerRef} style={{ width: "100%", height: "calc(100vh - 440px)", minHeight: 400 }} />
      </div>
    </div>
  );
}
