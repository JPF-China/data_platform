import { useState, useEffect, useCallback } from "react";
import type { AssetRecord, QualityRecord } from "../api";
import { fetchAssets, fetchQualityChecks } from "../api";

export function GovernanceSection() {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [quality, setQuality] = useState<QualityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, q] = await Promise.all([fetchAssets(), fetchQualityChecks()]);
      setAssets(a);
      setQuality(q);
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
    <div className="gov-section">
      <h3>数据资产目录</h3>
      <div className="kpi-row">
        {["DWD", "DWS", "ADS"].map((layer) => {
          const count = assets.filter((a) => a.asset_layer === layer).length;
          const ready = assets.filter((a) => a.asset_layer === layer && a.status === "ready").length;
          return (
            <div key={layer} className="kpi-card">
              <span className="kpi-label">{layer}</span>
              <span className="kpi-value">{ready}/{count}</span>
            </div>
          );
        })}
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>资产标识</th><th>显示名</th><th>层级</th><th>状态</th><th>行数</th><th>刷新时间</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.asset_key}>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{a.asset_key}</td>
                <td>{a.display_name}</td>
                <td><span style={{ padding: "1px 6px", borderRadius: 3, fontSize: "0.75rem", background: a.asset_layer === "ADS" ? "var(--accent)" : a.asset_layer === "DWS" ? "#a78bfa" : "#6ee7b7" }}>{a.asset_layer}</span></td>
                <td>{a.status}</td>
                <td>{a.row_count.toLocaleString()}</td>
                <td style={{ fontSize: "0.75rem" }}>{a.refreshed_at ? new Date(a.refreshed_at).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 24 }}>数据质量检查</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>检查项</th><th>状态</th><th>检查时间</th><th>详情</th>
            </tr>
          </thead>
          <tbody>
            {quality.map((q) => (
              <tr key={q.check_key}>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{q.check_key}</td>
                <td><span style={{ color: q.status === "pass" ? "#22c55e" : "#dc2626", fontWeight: 600 }}>{q.status === "pass" ? "PASS" : "FAIL"}</span></td>
                <td style={{ fontSize: "0.75rem" }}>{q.checked_at ? new Date(q.checked_at).toLocaleString() : "-"}</td>
                <td style={{ fontSize: "0.75rem" }}>{JSON.stringify(q.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
