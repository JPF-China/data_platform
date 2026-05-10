import { useState, useEffect, useCallback } from "react";
import type { DailyReportRow, WeeklyReportRow } from "../api";
import { fetchDailyReport, fetchWeeklyReport } from "../api";

export function ReportingSection() {
  const [daily, setDaily] = useState<DailyReportRow[]>([]);
  const [weekly, setWeekly] = useState<WeeklyReportRow[]>([]);
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

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="status-msg">加载中...</div>;
  if (error) return <div className="status-msg error">{error}</div>;

  return (
    <div className="report-section">
      <h3>日报</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>日期</th><th>行程数</th><th>车辆数</th><th>里程(km)</th>
              <th>平均距离(m)</th><th>均速(km/h)</th>
              <th>高峰比</th><th>夜间比</th>
              <th>疲劳</th><th>严重疲劳</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.report_date}>
                <td>{d.report_date}</td>
                <td>{d.total_trips}</td>
                <td>{d.total_vehicles}</td>
                <td>{d.total_distance_km.toFixed(1)}</td>
                <td>{d.avg_trip_distance_m?.toFixed(0) ?? "-"}</td>
                <td>{d.avg_speed_kmh?.toFixed(1) ?? "-"}</td>
                <td>{d.peak_hour_trip_ratio != null ? (d.peak_hour_trip_ratio * 100).toFixed(0) + "%" : "-"}</td>
                <td>{d.night_trip_ratio != null ? (d.night_trip_ratio * 100).toFixed(0) + "%" : "-"}</td>
                <td>{d.fatigue_count}</td>
                <td>{d.severe_fatigue_count}</td>
              </tr>
            ))}
            {daily.length === 0 && <tr><td colSpan={10} className="status-msg">暂无数据</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 24 }}>周报</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>周起始</th><th>周结束</th><th>总行程</th><th>总车辆</th>
              <th>里程(km)</th><th>日均行程</th><th>疲劳事件</th>
              <th>严重疲劳</th><th>异常事件</th>
            </tr>
          </thead>
          <tbody>
            {weekly.map((w) => (
              <tr key={w.week_start}>
                <td>{w.week_start}</td>
                <td>{w.week_end}</td>
                <td>{w.total_trips}</td>
                <td>{w.total_vehicles}</td>
                <td>{w.total_distance_km.toFixed(1)}</td>
                <td>{w.avg_daily_trips?.toFixed(1) ?? "-"}</td>
                <td>{w.fatigue_events}</td>
                <td>{w.severe_fatigue_events}</td>
                <td>{w.abnormal_events}</td>
              </tr>
            ))}
            {weekly.length === 0 && <tr><td colSpan={9} className="status-msg">暂无数据</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
