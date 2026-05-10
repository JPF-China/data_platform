import { useState, useEffect, useCallback } from "react";
import type { VehicleProfile, ActivityRankingItem } from "../api";
import { fetchVehicleProfiles, fetchActivityRanking } from "../api";

export function OpsProfileSection() {
  const [profiles, setProfiles] = useState<VehicleProfile[]>([]);
  const [totalVehicles, setTotalVehicles] = useState(0);
  const [totalTags, setTotalTags] = useState(0);
  const [ranking, setRanking] = useState<ActivityRankingItem[]>([]);
  const [tagFilter, setTagFilter] = useState("");
  const [rankCat, setRankCat] = useState("trip_count");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, a] = await Promise.all([
        fetchVehicleProfiles(50, tagFilter || undefined),
        fetchActivityRanking(rankCat, 20),
      ]);
      setProfiles(p.profiles);
      setTotalVehicles(p.total_vehicles);
      setTotalTags(p.total_tags);
      setRanking(a);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tagFilter, rankCat]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="status-msg">加载中...</div>;
  if (error) return <div className="status-msg error">{error}</div>;

  return (
    <div className="ops-section">
      <h3>车辆画像</h3>
      <div className="kpi-row">
        <div className="kpi-card">
          <span className="kpi-label">车辆总数</span>
          <span className="kpi-value">{totalVehicles.toLocaleString()}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">标签总数</span>
          <span className="kpi-value">{totalTags.toLocaleString()}</span>
        </div>
      </div>

      <div style={{ marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}>
        <label>标签筛选: </label>
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="">全部</option>
          <option value="commuter">通勤 (High Peak)</option>
          <option value="night_active">夜间活跃 (Night Active)</option>
        </select>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {tagFilter ? `筛选后 ${profiles.length} 辆` : `显示前 ${profiles.length} 辆`}
        </span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>车辆ID</th><th>活跃天数</th><th>行程数</th><th>总里程(m)</th>
              <th>平均速度</th><th>晨间</th><th>夜间</th><th>高峰</th><th>主导时段</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.vehicle_id}>
                <td style={{ fontFamily: "monospace" }}>{p.vehicle_id}</td>
                <td>{p.active_days}</td>
                <td>{p.trip_count}</td>
                <td>{p.total_distance_m.toLocaleString()}</td>
                <td>{p.avg_speed_kmh?.toFixed(1) ?? "-"}</td>
                <td>{p.morning_trip_count}</td>
                <td>{p.night_trip_count}</td>
                <td>{p.peak_trip_count}</td>
                <td>{p.dominant_start_hour ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 24 }}>活跃排行</h3>
      <div style={{ marginBottom: 8 }}>
        <label>维度: </label>
        <select value={rankCat} onChange={(e) => setRankCat(e.target.value)}>
          <option value="trip_count">按行程数</option>
          <option value="distance">按里程</option>
        </select>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>排名</th><th>车辆ID</th><th>行程数</th><th>总里程(m)</th>
              <th>活跃天数</th><th>日均行程</th><th>平均速度</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r) => (
              <tr key={r.vehicle_id + r.rank_category}>
                <td>#{r.rank_num}</td>
                <td style={{ fontFamily: "monospace" }}>{r.vehicle_id}</td>
                <td>{r.trip_count}</td>
                <td>{r.total_distance_m.toLocaleString()}</td>
                <td>{r.active_days}</td>
                <td>{r.avg_daily_trips?.toFixed(1) ?? "-"}</td>
                <td>{r.avg_speed_kmh?.toFixed(1) ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
