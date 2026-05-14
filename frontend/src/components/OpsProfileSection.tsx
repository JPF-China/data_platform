import { useState, useEffect, useCallback, useMemo } from "react";
import type { VehicleProfile, VehicleTag, ActivityRankingItem } from "../api";
import { fetchVehicleProfiles, fetchActivityRanking } from "../api";

export function OpsProfileSection() {
  const [profiles, setProfiles] = useState<VehicleProfile[]>([]);
  const [allTags, setAllTags] = useState<VehicleTag[]>([]);
  const [totalVehicles, setTotalVehicles] = useState(0);
  const [ranking, setRanking] = useState<ActivityRankingItem[]>([]);
  const [tagFilter, setTagFilter] = useState("");
  const [rankCat, setRankCat] = useState("trip_count");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [p, a] = await Promise.all([
        fetchVehicleProfiles(50, tagFilter || undefined),
        fetchActivityRanking(rankCat, 20),
      ]);
      setProfiles(p.profiles);
      setAllTags(p.tags);
      setTotalVehicles(p.total_vehicles);
      setRanking(a);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [tagFilter, rankCat]);
  useEffect(() => { load(); }, [load]);

  const commuterCount = useMemo(() => new Set(allTags.filter((t) => t.tag_code === "commuter").map((t) => t.vehicle_id)).size, [allTags]);
  const nightCount = useMemo(() => new Set(allTags.filter((t) => t.tag_code === "night_active").map((t) => t.vehicle_id)).size, [allTags]);

  if (loading) return <div className="flex items-center justify-center py-20 text-text-secondary">加载中...</div>;
  if (error) return <div className="bg-danger-light text-danger rounded-xl p-4 text-[13px]">{error}</div>;

  return (
    <div className="panel-fade space-y-4">
      {/* filters */}
      <div className="flex items-center gap-3 bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] px-4 py-2">
        <label className="flex items-center gap-1 text-[13px] text-text-secondary">
          标签
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="rounded-lg border border-border px-2 py-1 text-[13px] bg-surface-low">
            <option value="">全部</option>
            <option value="commuter">通勤</option>
            <option value="night_active">夜间活跃</option>
          </select>
        </label>
        <span className="text-[12px] text-text-secondary">{tagFilter ? `${profiles.length} 辆` : `共 ${totalVehicles.toLocaleString()} 辆车`}</span>
      </div>

      {/* main grid: table left / ranking right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* vehicle table */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
          <div className="overflow-y-auto hide-scrollbar" style={{ maxHeight: "calc(100vh - 280px)" }}>
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface-low">
                <tr className="text-text-secondary text-[11px] uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-medium">车辆ID</th>
                  <th className="text-right px-3 py-2 font-medium">活跃天</th>
                  <th className="text-right px-3 py-2 font-medium">行程数</th>
                  <th className="text-right px-3 py-2 font-medium">总里程(m)</th>
                  <th className="text-right px-3 py-2 font-medium">均速</th>
                  <th className="text-center px-3 py-2 font-medium">标签</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {profiles.map((p) => (
                  <tr key={p.vehicle_id} className="hover:bg-primary-light/30 transition-colors">
                    <td className="px-4 py-2 data-mono">{p.vehicle_id}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.active_days}</td>
                    <td className="px-3 py-2 text-right data-mono tabular-nums">{p.trip_count}</td>
                    <td className="px-3 py-2 text-right data-mono tabular-nums">{Math.round(p.total_distance_m).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.avg_speed_kmh?.toFixed(1) ?? "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-center gap-1">
                        {p.peak_trip_count >= 2 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">通勤</span>}
                        {p.night_trip_count >= 1 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#8e24aa]/10 text-[#8e24aa] font-medium">夜间</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ranking panel */}
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-semibold text-text">活跃排行</h4>
            <div className="flex rounded-lg border border-border overflow-hidden text-[11px]">
              <button onClick={() => setRankCat("trip_count")} className={`px-3 py-1 ${rankCat === "trip_count" ? "bg-primary text-white" : "hover:bg-surface-container"}`}>行程数</button>
              <button onClick={() => setRankCat("distance")} className={`px-3 py-1 border-l border-border ${rankCat === "distance" ? "bg-primary text-white" : "hover:bg-surface-container"}`}>里程</button>
            </div>
          </div>
          <div className="space-y-0.5 overflow-y-auto hide-scrollbar" style={{ maxHeight: "calc(100vh - 280px)" }}>
            {ranking.slice(0, 10).map((r, i) => (
              <div key={r.vehicle_id + r.rank_category} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-surface-low transition-colors">
                <span className="w-[24px] h-[24px] rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: i === 0 ? "#f9ab00" : i === 1 ? "#9ca3af" : i === 2 ? "#d97706" : "var(--color-surface-container)", color: i < 3 ? "#fff" : "var(--color-text-secondary)" }}>{r.rank_num}</span>
                <span className="data-mono text-[12px] flex-1 truncate">{r.vehicle_id}</span>
                <span className="data-mono text-[12px] font-medium tabular-nums">{rankCat === "trip_count" ? r.trip_count : Math.round(r.total_distance_m).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* tag summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5 flex items-center gap-4">
          <div className="w-[48px] h-[48px] rounded-full bg-primary-light flex items-center justify-center text-[24px]">🏢</div>
          <div><div className="text-[12px] text-text-secondary">通勤车辆</div><div className="text-[24px] font-bold text-text font-display data-mono">{commuterCount.toLocaleString()}</div></div>
        </div>
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5 flex items-center gap-4">
          <div className="w-[48px] h-[48px] rounded-full bg-[#8e24aa]/10 flex items-center justify-center text-[24px]">🌙</div>
          <div><div className="text-[12px] text-text-secondary">夜间活跃车辆</div><div className="text-[24px] font-bold text-text font-display data-mono">{nightCount.toLocaleString()}</div></div>
        </div>
      </div>
    </div>
  );
}
