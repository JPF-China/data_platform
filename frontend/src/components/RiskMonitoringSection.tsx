import { useState, useEffect, useCallback } from "react";
import type { FatigueRecord, AbnormalRecord, RiskSummaryRow } from "../api";
import { fetchFatigue, fetchAbnormal, fetchRiskSummary } from "../api";

function Badge({ level, labels }: { level: string; labels: Record<string, [string, string]> }) {
  const [label, color] = labels[level] ?? [level, "#6b7280"];
  return <span style={{ padding: "2px 8px", borderRadius: 4, background: color, color: "#fff", fontSize: "0.75rem" }}>{label}</span>;
}

const FATIGUE_LABELS: Record<string, [string, string]> = {
  severe: ["严重", "#dc2626"],
  fatigue: ["疲劳", "#f59e0b"],
  normal: ["正常", "#22c55e"],
};
const ABNORMAL_LABELS: Record<string, [string, string]> = {
  critical: ["严重", "#dc2626"],
  high: ["高风险", "#f59e0b"],
  moderate: ["中风险", "#3b82f6"],
};

export function RiskMonitoringSection() {
  const [fatigue, setFatigue] = useState<FatigueRecord[]>([]);
  const [abnormal, setAbnormal] = useState<AbnormalRecord[]>([]);
  const [summary, setSummary] = useState<RiskSummaryRow[]>([]);
  const [fatigueLevel, setFatigueLevel] = useState("");
  const [abnormalLevel, setAbnormalLevel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { load(); }, [load]);

  const filteredFatigue = fatigueLevel
    ? fatigue.filter((f) => f.fatigue_level === fatigueLevel)
    : fatigue;
  const filteredAbnormal = abnormalLevel
    ? abnormal.filter((a) => a.risk_level === abnormalLevel)
    : abnormal;

  if (loading) return <div className="status-msg">加载中...</div>;
  if (error) return <div className="status-msg error">{error}</div>;

  const latest = summary[0];

  return (
    <div className="risk-section">
      <h3>风险摘要</h3>
      {latest ? (
        <div className="kpi-row">
          <div className="kpi-card">
            <span className="kpi-label">总驾驶员</span>
            <span className="kpi-value">{latest.total_drivers.toLocaleString()}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">疲劳</span>
            <span className="kpi-value" style={{ color: latest.fatigue_drivers > 0 ? "#f59e0b" : undefined }}>{latest.fatigue_drivers}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">严重疲劳</span>
            <span className="kpi-value" style={{ color: latest.severe_fatigue_drivers > 0 ? "#dc2626" : undefined }}>{latest.severe_fatigue_drivers}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">异常运行</span>
            <span className="kpi-value">{latest.abnormal_running_events.toLocaleString()}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">夜间风险</span>
            <span className="kpi-value" style={{ color: latest.night_risk_drivers > 0 ? "#f59e0b" : undefined }}>{latest.night_risk_drivers}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">总体风险</span>
            <span className="kpi-value" style={{ color: latest.overall_risk_level === "critical" ? "#dc2626" : latest.overall_risk_level === "warning" ? "#f59e0b" : "#22c55e" }}>{latest.overall_risk_level ?? "-"}</span>
          </div>
        </div>
      ) : <p className="status-msg">暂无风险数据</p>}

      <h3 style={{ marginTop: 24 }}>
        疲劳驾驶记录
        <select value={fatigueLevel} onChange={(e) => setFatigueLevel(e.target.value)} style={{ marginLeft: 12, fontSize: "0.8rem" }}>
          <option value="">全部等级</option>
          <option value="severe">严重</option>
          <option value="fatigue">疲劳</option>
          <option value="normal">正常</option>
        </select>
        <span style={{ marginLeft: 8, fontSize: "0.75rem", color: "var(--text-muted)" }}>{filteredFatigue.length} 条</span>
      </h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>驾驶员ID</th><th>窗口起始</th><th>运行(分钟)</th><th>疲劳级别</th><th>阈值</th>
            </tr>
          </thead>
          <tbody>
            {filteredFatigue.slice(0, 30).map((f) => (
              <tr key={f.driver_id + f.window_start}>
                <td style={{ fontFamily: "monospace" }}>{f.driver_id}</td>
                <td style={{ fontSize: "0.75rem" }}>{new Date(f.window_start).toLocaleString()}</td>
                <td>{f.run_minutes}</td>
                <td><Badge level={f.fatigue_level} labels={FATIGUE_LABELS} /></td>
                <td>{f.threshold_minutes}min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 24 }}>
        异常长时间运行
        <select value={abnormalLevel} onChange={(e) => setAbnormalLevel(e.target.value)} style={{ marginLeft: 12, fontSize: "0.8rem" }}>
          <option value="">全部等级</option>
          <option value="critical">严重</option>
          <option value="high">高风险</option>
          <option value="moderate">中风险</option>
        </select>
        <span style={{ marginLeft: 8, fontSize: "0.75rem", color: "var(--text-muted)" }}>{filteredAbnormal.length} 条</span>
      </h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>驾驶员ID</th><th>日期</th><th>持续(分钟)</th><th>距离(m)</th><th>风险级别</th>
            </tr>
          </thead>
          <tbody>
            {filteredAbnormal.slice(0, 30).map((a) => (
              <tr key={a.driver_id + a.event_date}>
                <td style={{ fontFamily: "monospace" }}>{a.driver_id}</td>
                <td>{a.event_date}</td>
                <td>{a.single_trip_duration_min}</td>
                <td>{a.single_trip_distance_m.toLocaleString()}</td>
                <td><Badge level={a.risk_level} labels={ABNORMAL_LABELS} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
