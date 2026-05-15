import { useState, useEffect, useCallback } from "react";
import type { FatigueRecord, AbnormalRecord, RiskSummaryRow } from "../api";
import { fetchFatigue, fetchAbnormal, fetchRiskSummary } from "../api";
import { MetricCard, SectionShell, SurfaceCard } from "./Ui";

const FATIGUE_LABELS: Record<string, [string, string]> = {
  severe: ["严重", "#ba1a1a"],
  fatigue: ["疲劳", "#c55500"],
  normal: ["正常", "#34a853"],
};

const ABNORMAL_LABELS: Record<string, [string, string]> = {
  critical: ["严重", "#ba1a1a"],
  high: ["高风险", "#c55500"],
  moderate: ["中风险", "#1a73e8"],
};

function LevelBadge({
  level,
  labels,
  onClick,
}: {
  level: string;
  labels: Record<string, [string, string]>;
  onClick?: () => void;
}) {
  const [label, color] = labels[level] ?? [level, "#5f6368"];
  return (
    <span
      onClick={onClick}
      style={{ background: `${color}18`, color, cursor: onClick ? "pointer" : "default" }}
      className="badge"
    >
      {label}
    </span>
  );
}

export function RiskMonitoringSection({ onViewPath }: { onViewPath: (vehicleId: string) => Promise<void> | void }) {
  const [fatigue, setFatigue] = useState<FatigueRecord[]>([]);
  const [abnormal, setAbnormal] = useState<AbnormalRecord[]>([]);
  const [summary, setSummary] = useState<RiskSummaryRow[]>([]);
  const [fatigueLevel, setFatigueLevel] = useState("");
  const [abnormalLevel, setAbnormalLevel] = useState("");
  const [searchVid, setSearchVid] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const normalizedSearch = searchVid.trim();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, a, s] = await Promise.all([
        fetchFatigue(50),
        fetchAbnormal(50),
        fetchRiskSummary(),
      ]);
      setFatigue(f);
      setAbnormal(a);
      setSummary(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredFatigue = fatigue
    .filter((f) => (fatigueLevel ? f.fatigue_level === fatigueLevel : true))
    .filter((f) => (normalizedSearch ? f.vehicle_id.includes(normalizedSearch) : true));
  const filteredAbnormal = abnormal
    .filter((a) => (abnormalLevel ? a.risk_level === abnormalLevel : true))
    .filter((a) => (normalizedSearch ? a.vehicle_id.includes(normalizedSearch) : true));
  const latest = summary[0];

  if (loading) return <div className="loading">加载中...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <SectionShell
      title="风险监测"
      description="疲劳驾驶、异常运行与风险汇总"
      actions={
        <input
          placeholder="搜索车辆ID..."
          value={searchVid}
          onChange={(e) => {
            const v = e.target.value;
            setSearchVid(v);
            if (!v) {
              setFatigueLevel("");
              setAbnormalLevel("");
            }
          }}
        />
      }
    >
      {latest ? (
        <div className="kpi-grid">
          <MetricCard label="总车辆" value={latest.total_drivers.toLocaleString()} />
          <MetricCard label="疲劳" value={latest.fatigue_drivers} />
          <MetricCard label="严重疲劳" value={latest.severe_fatigue_drivers} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <SurfaceCard title="疲劳驾驶监测" className="flex flex-col min-h-[640px]">
          <div className="filter-bar">
            <select value={fatigueLevel} onChange={(e) => setFatigueLevel(e.target.value)}>
              <option value="">全部等级</option>
              <option value="severe">严重</option>
              <option value="fatigue">疲劳</option>
              <option value="normal">正常</option>
            </select>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface-low">
                <tr className="text-text-secondary text-[11px] uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-medium">车辆ID</th>
                  <th className="text-left px-3 py-2 font-medium">时间窗口</th>
                  <th className="text-right px-3 py-2 font-medium">运行(分)</th>
                  <th className="text-center px-3 py-2 font-medium">级别</th>
                  <th className="text-center px-3 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {filteredFatigue.slice(0, 30).map((f) => (
                  <tr key={f.vehicle_id + f.window_start} className="hover:bg-primary-light/30 transition-colors">
                    <td className="px-4 py-2 data-mono">{f.vehicle_id}</td>
                    <td className="px-3 py-2 data-mono text-[11px]">{new Date(f.window_start).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right data-mono tabular-nums">{f.run_minutes}</td>
                    <td className="px-3 py-2 text-center">
                      <LevelBadge level={f.fatigue_level} labels={FATIGUE_LABELS} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => {
                          setSearchVid(f.vehicle_id);
                          void onViewPath(f.vehicle_id);
                        }}
                      >
                        查看路径
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredFatigue.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-6 text-text-secondary text-[12px]">暂无数据</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        <SurfaceCard title="异常运行" className="flex flex-col min-h-[640px]">
          <div className="filter-bar">
            <select value={abnormalLevel} onChange={(e) => setAbnormalLevel(e.target.value)}>
              <option value="">全部等级</option>
              <option value="critical">严重</option>
              <option value="high">高风险</option>
              <option value="moderate">中风险</option>
            </select>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface-low">
                <tr className="text-text-secondary text-[11px] uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-medium">车辆ID</th>
                  <th className="text-left px-3 py-2 font-medium">日期</th>
                  <th className="text-right px-3 py-2 font-medium">时长(分)</th>
                  <th className="text-center px-3 py-2 font-medium">级别</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {filteredAbnormal.slice(0, 30).map((a) => (
                  <tr key={a.vehicle_id + a.event_date} className="hover:bg-primary-light/30 transition-colors">
                    <td className="px-4 py-2 data-mono">{a.vehicle_id}</td>
                    <td className="px-3 py-2 text-[11px]">{a.event_date}</td>
                    <td className="px-3 py-2 text-right data-mono tabular-nums">{a.single_trip_duration_min}</td>
                    <td className="px-3 py-2 text-center">
                      <LevelBadge level={a.risk_level} labels={ABNORMAL_LABELS} />
                    </td>
                  </tr>
                ))}
                {filteredAbnormal.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-6 text-text-secondary text-[12px]">暂无数据</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      </div>
    </SectionShell>
  );
}
