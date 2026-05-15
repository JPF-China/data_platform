import { useState } from "react";
import type { BoxRow, DailyPoint } from "../api";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

/* color tokens — all CSS custom properties from index.css, dark-mode aware */
const V = {
  surface: "var(--color-surface)",
  surfaceLow: "var(--color-surface-low)",
  surfaceContainer: "var(--color-surface-container)",
  border: "var(--color-border)",
  borderLight: "var(--color-border-light)",
  text: "var(--color-text)",
  textSecondary: "var(--color-text-secondary)",
  primary: "var(--color-primary)",
  primaryDark: "var(--color-primary-dark)",
  primaryLight: "var(--color-primary-light)",
  success: "var(--color-success)",
  tertiary: "var(--color-tertiary)",
  cardBg: "var(--color-surface)",
  cardBorder: "var(--color-border-light)",
  cardShadow: "0 1px 3px rgba(0,0,0,0.04)",
} as const;

const CHART_BLUE = "#1a73e8";
const CHART_AMBER = "#c55500";
const CHART_GRID = "var(--color-border-light)";
const CHART_AXIS = "var(--color-text-secondary)";

const tooltipTheme = {
  contentStyle: {
    background: "var(--color-surface)", border: "1px solid var(--color-border-light)", borderRadius: 10,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)", padding: "10px 14px",
    fontSize: 13, fontFamily: "'Inter',system-ui,sans-serif",
  },
  labelStyle: { fontWeight: 700 as const, marginBottom: 4, color: "var(--color-text)" },
  itemStyle: { color: "var(--color-text-secondary)" },
};

function BoxplotMini({ data, unit }: { data: BoxRow[]; unit: string }) {
  const [hoverText, setHoverText] = useState("");
  if (!data.length) return <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-secondary)", fontSize: 13 }}>暂无箱线图数据</div>;
  const all = data.flatMap((d) => [d.min_value, d.q1, d.median, d.q3, d.max_value]).filter((v) => Number.isFinite(v));
  if (!all.length) return <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-secondary)", fontSize: 13 }}>暂无箱线图数据</div>;
  const min = Math.min(...all), max = Math.max(...all);
  const H = 200, W = 540, top = 10, bottom = 170, usable = bottom - top;
  const y = (v: number) => bottom - ((v - min) / Math.max(1e-9, max - min)) * usable;
  const rows = data.filter((d) => [d.min_value, d.q1, d.median, d.q3, d.max_value].every((v) => Number.isFinite(v)));
  const band = W / rows.length;
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
        {rows.map((d, i) => {
          const cx = i * band + band / 2, boxW = Math.min(32, band * 0.4);
          return (
            <g key={i}>
              <title>{`${d.trip_date} min:${d.min_value.toFixed(1)} ${unit} q1:${d.q1.toFixed(1)} median:${d.median.toFixed(1)} q3:${d.q3.toFixed(1)} max:${d.max_value.toFixed(1)} n:${d.sample_count}`}</title>
              <line x1={cx} x2={cx} y1={y(d.min_value)} y2={y(d.max_value)} stroke={CHART_BLUE} strokeWidth={1.2} />
              <line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={y(d.max_value)} y2={y(d.max_value)} stroke={CHART_BLUE} strokeWidth={1} />
              <line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={y(d.min_value)} y2={y(d.min_value)} stroke={CHART_BLUE} strokeWidth={1} />
              <rect x={cx - boxW / 2} y={y(d.q3)} width={boxW} height={Math.max(2, y(d.q1) - y(d.q3))}
                fill="rgba(26,115,232,0.08)" stroke={CHART_BLUE} strokeWidth={1.2} rx={2}
                onMouseEnter={() => setHoverText(`${d.trip_date} | min:${d.min_value.toFixed(1)} q1:${d.q1.toFixed(1)} median:${d.median.toFixed(1)} q3:${d.q3.toFixed(1)} max:${d.max_value.toFixed(1)} n:${d.sample_count}`)}
                onMouseLeave={() => setHoverText("")} />
              <line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={y(d.median)} y2={y(d.median)} stroke={CHART_AMBER} strokeWidth={2} />
            </g>
          );
        })}
      </svg>
      <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-secondary)", textAlign: "center" }}>
        {hoverText || "悬停箱体查看精确数值"}
      </div>
    </div>
  );
}

function ChartCard({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{
      background: V.cardBg, border: `1px solid ${V.cardBorder}`, borderRadius: 12,
      padding: "20px 24px", boxShadow: V.cardShadow,
      display: "flex", flexDirection: "column", gap: 12,
      color: V.text,
      ...(wide ? { gridColumn: "1 / -1" } : {}),
    } as React.CSSProperties}>
      <h4 style={{ margin: 0, fontFamily: "'Work Sans',sans-serif", fontSize: 14, fontWeight: 600, color: V.text }}>{title}</h4>
      {children}
    </div>
  );
}

export function OverviewSection({ tripCount, vehicleCount, distanceKm, tripSeries, vehicleSeries, distanceSeries, speedBox, distanceBox }: {
  tripCount: number; vehicleCount: number; distanceKm: number;
  tripSeries: DailyPoint[]; vehicleSeries: DailyPoint[]; distanceSeries: DailyPoint[];
  speedBox: BoxRow[]; distanceBox: BoxRow[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        {[
          { label: "总行程数", value: tripCount.toLocaleString(), sub: "累计行程总量", color: CHART_BLUE },
          { label: "单日峰值车辆数", value: vehicleCount.toLocaleString(), sub: "活跃车辆峰值", color: "#34a853" },
          { label: "总里程", value: `${distanceKm.toFixed(2)} km`, sub: "累计行驶里程", color: CHART_AMBER },
        ].map((k, i) => (
          <div key={i} style={{
            background: V.cardBg, border: `1px solid ${V.cardBorder}`, borderRadius: 12,
            padding: "20px 24px", boxShadow: V.cardShadow,
            display: "flex", flexDirection: "column", gap: 6,
            borderLeft: `4px solid ${k.color}`,
          } as React.CSSProperties}>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: V.textSecondary, fontWeight: 600 }}>{k.label}</span>
            <span style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 32, fontWeight: 700, color: V.text }}>{k.value}</span>
            <span style={{ fontSize: 12, color: V.textSecondary }}>{k.sub}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
        <ChartCard title="每日行程数">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={tripSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
              <XAxis dataKey="date" stroke={CHART_AXIS} tick={{ fontSize: 11 }} />
              <YAxis stroke={CHART_AXIS} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${Number(v) || 0}`, "行程数"]} {...tooltipTheme} />
              <Bar dataKey="value" fill={CHART_BLUE} radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="每日车辆数">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={vehicleSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
              <XAxis dataKey="date" stroke={CHART_AXIS} tick={{ fontSize: 11 }} />
              <YAxis stroke={CHART_AXIS} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${Number(v) || 0}`, "车辆数"]} {...tooltipTheme} />
              <Bar dataKey="value" fill={CHART_AMBER} radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="每日里程">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={distanceSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
              <XAxis dataKey="date" stroke={CHART_AXIS} tick={{ fontSize: 11 }} />
              <YAxis stroke={CHART_AXIS} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${(Number(v) || 0).toFixed(1)} km`, "里程"]} {...tooltipTheme} />
              <Line dataKey="value" stroke={CHART_BLUE} strokeWidth={3} dot={{ r: 3, fill: CHART_BLUE }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="每日速度箱线图">
          <BoxplotMini data={speedBox} unit="km/h" />
        </ChartCard>
        <ChartCard title="每日里程箱线图" wide>
          <BoxplotMini data={distanceBox} unit="m" />
        </ChartCard>
      </div>
    </div>
  );
}
