import { useState, useEffect, useCallback } from "react";
import type { FatigueRecord, AbnormalRecord, RiskSummaryRow } from "../api";
import { fetchFatigue, fetchAbnormal, fetchRiskSummary } from "../api";

const FATIGUE_LABELS: Record<string, [string, string]> = {
  severe: ["严重", "#ea4335"],
  fatigue: ["疲劳", "#f9ab00"],
  normal: ["正常", "#34a853"],
};
const ABNORMAL_LABELS: Record<string, [string, string]> = {
  critical: ["严重", "#ea4335"],
  high: ["高风险", "#f9ab00"],
  moderate: ["中风险", "#1a73e8"],
};

function Badge({ level, labels, onClick }: { level: string; labels: Record<string, [string, string]>; onClick?: () => void }) {
  const [label, color] = labels[level] ?? [level, "#5f6368"];
  return (
    <span
      onClick={onClick}
      style={{ background: `${color}18`, color, cursor: onClick ? "pointer" : "default" }}
      className="text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap hover:opacity-80 transition-opacity"
    >
      {label}
    </span>
  );
}

export function RiskMonitoringSection() {
  const [fatigue, setFatigue] = useState<FatigueRecord[]>([]);
  const [abnormal, setAbnormal] = useState<AbnormalRecord[]>([]);
  const [summary, setSummary] = useState<RiskSummaryRow[]>([]);
  const [fatigueLevel, setFatigueLevel] = useState("");
  const [abnormalLevel, setAbnormalLevel] = useState("");
  const [searchVid, setSearchVid] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [f, a, s] = await Promise.all([fetchFatigue(50), fetchAbnormal(50), fetchRiskSummary()]);
      setFatigue(f); setAbnormal(a); setSummary(s);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filteredFatigue = fatigueLevel ? fatigue.filter((f) => f.fatigue_level === fatigueLevel) : fatigue;
  const filteredAbnormal = abnormalLevel ? abnormal.filter((a) => a.risk_level === abnormalLevel) : abnormal;

  const latest = summary[0];

  if (loading) return <div className="flex items-center justify-center py-20 text-text-secondary">加载中...</div>;
  if (error) return <div className="bg-danger-light text-danger rounded-xl p-4 text-[13px]">{error}</div>;

  return (
    <div className="panel-fade space-y-4">
      {/* risk summary KPI pills */}
      {latest && (
        <div className="flex flex-wrap gap-2 bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-3">
          {[
            ["总驾驶员", latest.total_drivers.toLocaleString(), "text-text"],
            ["疲劳", latest.fatigue_drivers, "text-warning"],
            ["严重疲劳", latest.severe_fatigue_drivers, "text-danger"],
            ["异常运行", latest.abnormal_running_events.toLocaleString(), "text-text"],
            ["夜间风险", latest.night_risk_drivers, "text-warning"],
            ["总体", latest.overall_risk_level === "critical" ? "严重" : latest.overall_risk_level === "warning" ? "警告" : "正常",
              latest.overall_risk_level === "critical" ? "text-white bg-danger" : latest.overall_risk_level === "warning" ? "text-white bg-warning" : "text-white bg-success"],
          ].map(([label, value, cls]) => (
            <div key={label as string} className={`px-3 py-1 rounded-full text-[12px] font-medium ${cls}`}>
              {label as string}: <span className="font-bold">{value as string}</span>
            </div>
          ))}
        </div>
      )}

      {/* search vehicle */}
      <div className="flex items-center gap-2 bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] px-4 py-2">
        <input
          placeholder="搜索驾驶员ID..."
          value={searchVid}
          onChange={(e) => {
            const v = e.target.value;
            setSearchVid(v);
            if (!v) { setFatigueLevel(""); setAbnormalLevel(""); }
          }}
          className="h-[32px] px-3 rounded-lg border border-border text-[13px] flex-1 focus:outline-none focus:border-primary"
        />
      </div>

      {/* 60/40 layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* fatigue table */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <h4 className="text-[13px] font-semibold text-text">疲劳驾驶监测</h4>
            <select value={fatigueLevel} onChange={(e) => setFatigueLevel(e.target.value)} className="rounded-lg border border-border px-2 py-1 text-[12px] bg-surface-low">
              <option value="">全部等级</option>
              <option value="severe">严重</option>
              <option value="fatigue">疲劳</option>
              <option value="normal">正常</option>
            </select>
          </div>
          <div className="overflow-y-auto hide-scrollbar" style={{ maxHeight: "calc(100vh - 300px)" }}>
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface-low">
                <tr className="text-text-secondary text-[11px] uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-medium">驾驶员ID</th>
                  <th className="text-left px-3 py-2 font-medium">时间窗口</th>
                  <th className="text-right px-3 py-2 font-medium">运行(分)</th>
                  <th className="text-center px-3 py-2 font-medium">级别</th>
                  <th className="text-center px-3 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {filteredFatigue.slice(0, 30).map((f) => (
                  <tr key={f.driver_id + f.window_start} className="hover:bg-primary-light/30 transition-colors">
                    <td className="px-4 py-2 data-mono">{f.driver_id}</td>
                    <td className="px-3 py-2 data-mono text-[11px]">{new Date(f.window_start).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right data-mono tabular-nums">{f.run_minutes}</td>
                    <td className="px-3 py-2 text-center"><Badge level={f.fatigue_level} labels={FATIGUE_LABELS} /></td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => { setSearchVid(f.driver_id); }} className="text-[11px] text-primary hover:underline">查看路径</button>
                    </td>
                  </tr>
                ))}
                {filteredFatigue.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-text-secondary text-[12px]">暂无数据</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* abnormal table */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <h4 className="text-[13px] font-semibold text-text">异常运行</h4>
            <select value={abnormalLevel} onChange={(e) => setAbnormalLevel(e.target.value)} className="rounded-lg border border-border px-2 py-1 text-[12px] bg-surface-low">
              <option value="">全部等级</option>
              <option value="critical">严重</option>
              <option value="high">高风险</option>
              <option value="moderate">中风险</option>
            </select>
          </div>
          <div className="overflow-y-auto hide-scrollbar" style={{ maxHeight: "calc(100vh - 300px)" }}>
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface-low">
                <tr className="text-text-secondary text-[11px] uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-medium">驾驶员ID</th>
                  <th className="text-left px-3 py-2 font-medium">日期</th>
                  <th className="text-right px-3 py-2 font-medium">时长(分)</th>
                  <th className="text-center px-3 py-2 font-medium">级别</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {filteredAbnormal.slice(0, 30).map((a) => (
                  <tr key={a.driver_id + a.event_date} className="hover:bg-primary-light/30 transition-colors">
                    <td className="px-4 py-2 data-mono">{a.driver_id}</td>
                    <td className="px-3 py-2 text-[11px]">{a.event_date}</td>
                    <td className="px-3 py-2 text-right data-mono tabular-nums">{a.single_trip_duration_min}</td>
                    <td className="px-3 py-2 text-center"><Badge level={a.risk_level} labels={ABNORMAL_LABELS} /></td>
                  </tr>
                ))}
                {filteredAbnormal.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-text-secondary text-[12px]">暂无数据</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
