import { useState, useEffect, useCallback } from "react";
import type { AssetRecord, QualityRecord } from "../api";
import { fetchAssets, fetchQualityChecks } from "../api";

export function GovernanceSection() {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [quality, setQuality] = useState<QualityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [a, q] = await Promise.all([fetchAssets(), fetchQualityChecks()]);
      setAssets(a); setQuality(q);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-20 text-text-secondary">加载中...</div>;
  if (error) return <div className="bg-danger-light text-danger rounded-xl p-4 text-[13px]">{error}</div>;

  const layers = ["DWD", "DWS", "ADS"] as const;
  const layerStats = layers.map((layer) => {
    const layerAssets = assets.filter((a) => a.asset_layer === layer);
    const ready = layerAssets.filter((a) => a.status === "ready").length;
    const total = layerAssets.length;
    const rows = layerAssets.reduce((s, a) => s + Math.max(0, a.row_count), 0);
    const pct = total > 0 ? Math.round((ready / total) * 100) : 0;
    return { layer, total, ready, rows, pct };
  });

  return (
    <div className="panel-fade space-y-4">
      <div>
        <h3 className="text-[18px] font-semibold text-text font-display">数据治理概览</h3>
        <p className="text-[13px] text-text-secondary mt-0.5">数仓分层监控与资产质量</p>
      </div>

      {/* layer cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {layerStats.map((ls) => {
          const barColor = ls.pct >= 100 ? "#34a853" : ls.pct >= 80 ? "#f9ab00" : "#ea4335";
          return (
            <div key={ls.layer} className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5 relative overflow-hidden">
              <div className="absolute -top-4 -right-4 w-[80px] h-[80px] rounded-bl-full bg-primary/5" />
              <div className="text-[24px] font-bold text-text font-display mb-1">{ls.layer}</div>
              <div className="text-[12px] text-text-secondary mb-3">
                {ls.total} 张表 · {ls.rows.toLocaleString()} 行
              </div>
              <div className="progress-bar mb-1">
                <div className="progress-bar-fill" style={{ width: `${ls.pct}%`, background: barColor }} />
              </div>
              <div className="text-[11px] text-text-secondary flex justify-between">
                <span>就绪 {ls.ready}/{ls.total}</span>
                <span style={{ color: barColor }}>{ls.pct}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* asset table + quality panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* asset catalog table */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
          <div className="px-4 py-2 border-b border-border">
            <h4 className="text-[13px] font-semibold text-text">核心资产目录</h4>
          </div>
          <div className="overflow-y-auto hide-scrollbar" style={{ maxHeight: "calc(100vh - 320px)" }}>
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface-low">
                <tr className="text-text-secondary text-[11px] uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-medium">资产标识</th>
                  <th className="text-left px-3 py-2 font-medium">显示名</th>
                  <th className="text-center px-3 py-2 font-medium">层级</th>
                  <th className="text-center px-3 py-2 font-medium">状态</th>
                  <th className="text-right px-3 py-2 font-medium">行数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {assets.map((a) => (
                  <tr key={a.asset_key} className="hover:bg-primary-light/30 transition-colors">
                    <td className="px-4 py-2 data-mono text-[12px]">{a.asset_key}</td>
                    <td className="px-3 py-2">{a.display_name}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        a.asset_layer === "ADS" ? "bg-primary/10 text-primary" : a.asset_layer === "DWS" ? "bg-[#7c3aed]/10 text-[#7c3aed]" : "bg-success-light text-success"
                      }`}>{a.asset_layer}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 text-[11px] ${a.status === "ready" ? "text-success" : a.status === "unknown" ? "text-text-secondary" : "text-danger"}`}>
                        <span className={`pulse-dot ${a.status === "ready" ? "green" : a.status === "unknown" ? "yellow animate" : "red"}`} />
                        {a.status === "ready" ? "就绪" : a.status === "unknown" ? "未知" : a.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right data-mono tabular-nums">{a.row_count > 0 ? a.row_count.toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* quality panel */}
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4">
          <h4 className="text-[13px] font-semibold text-text mb-3">质量检查报告</h4>
          <div className="space-y-2">
            {quality.map((q) => {
              const isPass = q.status === "pass";
              return (
                <div key={q.check_key} className={`rounded-lg p-3 border-l-[3px] ${isPass ? "border-l-success bg-success-light/30" : "border-l-danger bg-danger-light/30"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium data-mono">{q.check_key}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${isPass ? "bg-success text-white" : "bg-danger text-white"}`}>{isPass ? "PASS" : "FAIL"}</span>
                  </div>
                  <div className="text-[11px] text-text-secondary">
                    {Object.entries(q.details).map(([k, v]) => (
                      <span key={k} className="mr-2">{k}={String(v)}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
