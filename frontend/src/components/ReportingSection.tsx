import { useState, useEffect, useCallback } from "react";
import type { DailyReportRow, WeeklyReportRow } from "../api";
import { fetchDailyReport, fetchWeeklyReport } from "../api";
import { MetricCard, SectionShell, SurfaceCard } from "./Ui";

export function ReportingSection() {
  const [daily, setDaily] = useState<DailyReportRow[]>([]);
  const [weekly, setWeekly] = useState<WeeklyReportRow[]>([]);
  const [tab, setTab] = useState<"daily" | "weekly">("daily");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, w] = await Promise.all([fetchDailyReport(14), fetchWeeklyReport(8)]);
      setDaily(d);
      setWeekly(w);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="loading">加载中...</div>;
  if (error) return <div className="error">{error}</div>;

  const kpis = tab === "daily" && daily.length > 0
    ? [
        ["总行程", daily.reduce((a, r) => a + r.total_trips, 0).toLocaleString()],
        ["出车数", daily.reduce((a, r) => a + r.total_vehicles, 0).toLocaleString()],
        ["总里程", `${daily.reduce((a, r) => a + r.total_distance_km, 0).toLocaleString()} km`],
        ["总疲劳", daily.reduce((a, r) => a + r.fatigue_count + r.severe_fatigue_count, 0).toLocaleString()],
      ]
    : tab === "weekly" && weekly.length > 0
    ? [
        ["总行程", weekly.reduce((a, r) => a + r.total_trips, 0).toLocaleString()],
        ["总车辆", weekly.reduce((a, r) => a + r.total_vehicles, 0).toLocaleString()],
        ["总里程", `${weekly.reduce((a, r) => a + r.total_distance_km, 0).toLocaleString()} km`],
        ["疲劳事件", weekly.reduce((a, r) => a + r.fatigue_events + r.severe_fatigue_events, 0).toLocaleString()],
      ]
    : [];

  return (
    <SectionShell
      title="运营报表"
      description="日报与周报视图"
      actions={
        <div className="theme-buttons">
          <button type="button" className={`theme-btn ${tab === "daily" ? "active" : ""}`} onClick={() => setTab("daily")}>日报</button>
          <button type="button" className={`theme-btn ${tab === "weekly" ? "active" : ""}`} onClick={() => setTab("weekly")}>周报</button>
        </div>
      }
    >
      {kpis.length > 0 ? (
        <div className="kpi-grid">
          {kpis.map(([label, value]) => <MetricCard key={label} label={label} value={value} />)}
        </div>
      ) : null}

      <SurfaceCard>
        <div className="overflow-y-auto hide-scrollbar" style={{ maxHeight: "calc(100vh - 320px)" }}>
          {tab === "daily" ? (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface-low">
                <tr className="text-text-secondary text-[11px] uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-medium">日期</th>
                  <th className="text-right px-3 py-2 font-medium">行程数</th>
                  <th className="text-right px-3 py-2 font-medium">车辆数</th>
                  <th className="text-right px-3 py-2 font-medium">里程(km)</th>
                  <th className="text-right px-3 py-2 font-medium">均速</th>
                  <th className="text-center px-2 py-2 font-medium w-[80px]">高峰比</th>
                  <th className="text-center px-2 py-2 font-medium w-[80px]">夜间比</th>
                  <th className="text-right px-3 py-2 font-medium">疲劳</th>
                  <th className="text-right px-3 py-2 font-medium">严重</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {daily.map((d) => {
                  const peakPct = d.peak_hour_trip_ratio != null ? Math.round(d.peak_hour_trip_ratio * 100) : 0;
                  const nightPct = d.night_trip_ratio != null ? Math.round(d.night_trip_ratio * 100) : 0;
                  return (
                    <tr key={d.report_date} className="hover:bg-primary-light/30 transition-colors">
                      <td className="px-4 py-2 data-mono">{d.report_date}</td>
                      <td className="px-3 py-2 text-right data-mono tabular-nums">{d.total_trips.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.total_vehicles}</td>
                      <td className="px-3 py-2 text-right data-mono tabular-nums">{d.total_distance_km.toFixed(0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.avg_speed_kmh?.toFixed(1) ?? "-"}</td>
                      <td className="px-2 py-2"><div className="progress-bar"><div className="progress-bar-fill bg-primary" style={{ width: `${peakPct}%` }} /></div><div className="text-[10px] text-text-secondary text-center">{peakPct}%</div></td>
                      <td className="px-2 py-2"><div className="progress-bar"><div className="progress-bar-fill bg-tertiary" style={{ width: `${nightPct}%` }} /></div><div className="text-[10px] text-text-secondary text-center">{nightPct}%</div></td>
                      <td className="px-3 py-2 text-right tabular-nums text-warning">{d.fatigue_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-danger">{d.severe_fatigue_count}</td>
                    </tr>
                  );
                })}
                {daily.length === 0 ? <tr><td colSpan={9} className="text-center py-6 text-text-secondary text-[12px]">暂无数据</td></tr> : null}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface-low">
                <tr className="text-text-secondary text-[11px] uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-medium">周起始</th>
                  <th className="text-left px-3 py-2 font-medium">周结束</th>
                  <th className="text-right px-3 py-2 font-medium">总行程</th>
                  <th className="text-right px-3 py-2 font-medium">总车辆</th>
                  <th className="text-right px-3 py-2 font-medium">里程(km)</th>
                  <th className="text-right px-3 py-2 font-medium">日均</th>
                  <th className="text-right px-3 py-2 font-medium">疲劳</th>
                  <th className="text-right px-3 py-2 font-medium">严重</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {weekly.map((w) => (
                  <tr key={w.week_start} className="hover:bg-primary-light/30 transition-colors">
                    <td className="px-4 py-2 data-mono text-[11px]">{w.week_start}</td>
                    <td className="px-3 py-2 data-mono text-[11px]">{w.week_end}</td>
                    <td className="px-3 py-2 text-right data-mono tabular-nums">{w.total_trips.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{w.total_vehicles}</td>
                    <td className="px-3 py-2 text-right data-mono tabular-nums">{w.total_distance_km.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right data-mono tabular-nums">{w.avg_daily_trips?.toFixed(0) ?? "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-warning">{w.fatigue_events}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-danger">{w.severe_fatigue_events}</td>
                  </tr>
                ))}
                {weekly.length === 0 ? <tr><td colSpan={8} className="text-center py-6 text-text-secondary text-[12px]">暂无数据</td></tr> : null}
              </tbody>
            </table>
          )}
        </div>
      </SurfaceCard>
    </SectionShell>
  );
}
