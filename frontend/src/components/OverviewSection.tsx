import { useState } from "react";
import type { BoxRow, DailyPoint } from "../api";
import { MetricCard, SurfaceCard } from "./Ui";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipTheme = {
  contentStyle: {
    background: "var(--bg-panel-soft)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    color: "var(--text-main)",
  },
  labelStyle: { color: "var(--text-main)", fontWeight: 700 },
  itemStyle: { color: "var(--text-dim)" },
};

function BoxplotMini({ data, unit }: { data: BoxRow[]; unit: string }) {
  const [hoverText, setHoverText] = useState("");
  if (!data.length) return <div className="empty">暂无箱线图数据</div>;
  const all = data.flatMap((d) => [d.min_value, d.q1, d.median, d.q3, d.max_value]).filter((v) => Number.isFinite(v));
  if (!all.length) return <div className="empty">暂无箱线图数据</div>;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const height = 210;
  const width = 520;
  const chartTop = 14;
  const chartBottom = 186;
  const usableH = chartBottom - chartTop;
  const band = width / data.length;
  const y = (v: number) => chartBottom - ((v - min) / Math.max(1e-9, max - min)) * usableH;

  const rows = data.filter((d) => [d.min_value, d.q1, d.median, d.q3, d.max_value].every((v) => Number.isFinite(v)));
  return (
    <div className="boxplot-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="boxplot-svg">
        {rows.map((d, i) => {
          const cx = i * band + band / 2;
          const boxW = Math.min(34, band * 0.45);
          return (
            <g key={`${d.trip_date}-${i}`}>
              <title>{`${d.trip_date} min:${d.min_value.toFixed(2)} ${unit}, q1:${d.q1.toFixed(2)} ${unit}, median:${d.median.toFixed(2)} ${unit}, q3:${d.q3.toFixed(2)} ${unit}, max:${d.max_value.toFixed(2)} ${unit}, n:${d.sample_count}`}</title>
              <line x1={cx} x2={cx} y1={y(d.min_value)} y2={y(d.max_value)} stroke="var(--plot-line)" strokeWidth={1.4} />
              <line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={y(d.max_value)} y2={y(d.max_value)} stroke="var(--plot-line)" strokeWidth={1.2} />
              <line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={y(d.min_value)} y2={y(d.min_value)} stroke="var(--plot-line)" strokeWidth={1.2} />
              <rect
                x={cx - boxW / 2}
                y={y(d.q3)}
                width={boxW}
                height={Math.max(2, y(d.q1) - y(d.q3))}
                fill="var(--plot-box-bg)"
                stroke="var(--plot-box-line)"
                strokeWidth={1.2}
                onMouseEnter={() =>
                  setHoverText(
                    `${d.trip_date} | min=${d.min_value.toFixed(2)} ${unit}, q1=${d.q1.toFixed(2)} ${unit}, median=${d.median.toFixed(2)} ${unit}, q3=${d.q3.toFixed(2)} ${unit}, max=${d.max_value.toFixed(2)} ${unit}, n=${d.sample_count}`
                  )
                }
                onMouseLeave={() => setHoverText("")}
              />
              <line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={y(d.median)} y2={y(d.median)} stroke="var(--plot-median)" strokeWidth={1.8} />
              <text x={cx} y={202} textAnchor="middle" className="boxplot-label">{(d.trip_date ?? "").slice(5)}</text>
            </g>
          );
        })}
      </svg>
      <div className="boxplot-hover">{hoverText || "悬停箱体可查看精确数值"}</div>
    </div>
  );
}

export function OverviewSection({
  tripCount,
  vehicleCount,
  distanceKm,
  tripSeries,
  vehicleSeries,
  distanceSeries,
  speedBox,
  distanceBox,
}: {
  tripCount: number;
  vehicleCount: number;
  distanceKm: number;
  tripSeries: DailyPoint[];
  vehicleSeries: DailyPoint[];
  distanceSeries: DailyPoint[];
  speedBox: BoxRow[];
  distanceBox: BoxRow[];
}) {
  return (
    <div className="overview-layout">
      <section className="kpi-grid">
        <MetricCard label="总行程数" value={tripCount.toLocaleString()} />
        <MetricCard label="单日峰值车辆数" value={vehicleCount.toLocaleString()} />
        <MetricCard label="总里程（km）" value={distanceKm.toFixed(2)} />
      </section>

      <section className="panel-grid">
        <SurfaceCard title="每日行程数">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={tripSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="date" stroke="var(--chart-axis)" />
              <YAxis stroke="var(--chart-axis)" />
              <Tooltip formatter={(value) => [`${Number(value) || 0}`, "行程数"]} {...tooltipTheme} />
              <Bar dataKey="value" fill="var(--chart-cyan)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SurfaceCard>
        <SurfaceCard title="每日车辆数">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={vehicleSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="date" stroke="var(--chart-axis)" />
              <YAxis stroke="var(--chart-axis)" />
              <Tooltip formatter={(value) => [`${Number(value) || 0}`, "车辆数"]} {...tooltipTheme} />
              <Bar dataKey="value" fill="var(--chart-amber)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SurfaceCard>
        <SurfaceCard title="每日里程" className="panel-wide">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={distanceSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="date" stroke="var(--chart-axis)" />
              <YAxis stroke="var(--chart-axis)" />
              <Tooltip formatter={(value) => [`${(Number(value) || 0).toFixed(2)} km`, "里程"]} {...tooltipTheme} />
              <Line dataKey="value" stroke="var(--chart-cyan)" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </SurfaceCard>
      </section>

      <section className="panel-grid single-mode">
        <SurfaceCard title="里程箱线图">
          <BoxplotMini data={distanceBox} unit="m" />
        </SurfaceCard>
        <SurfaceCard title="速度箱线图">
          <BoxplotMini data={speedBox} unit="km/h" />
        </SurfaceCard>
      </section>
    </div>
  );
}
