import { useState, useEffect, useCallback } from "react";
import type { AssetRecord, QualityRecord } from "../api";
import { fetchAssets, fetchQualityChecks } from "../api";
import { MetricCard, SectionShell, SurfaceCard } from "./Ui";

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

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="loading">加载中...</div>;
  if (error) return <div className="error">{error}</div>;

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
    <SectionShell title="数据治理" description="数仓分层监控与资产质量">
      <div className="kpi-grid">
        {layerStats.map((ls) => (
          <MetricCard key={ls.layer} label={ls.layer} value={`${ls.ready}/${ls.total}`} hint={`${ls.rows.toLocaleString()} 行 · ${ls.pct}% 就绪`} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SurfaceCard title="核心资产目录" className="lg:col-span-2">
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
                      <span className="badge badge--neutral">{a.asset_layer}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="badge badge--primary">
                        {a.status === "ready" ? "就绪" : a.status === "unknown" ? "未知" : a.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right data-mono tabular-nums">{a.row_count > 0 ? a.row_count.toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        <SurfaceCard title="质量检查报告">
          <div className="space-y-2">
            {quality.map((q) => {
              const isPass = q.status === "pass";
              return (
                <div key={q.check_key} className={`rounded-lg p-3 border-l-[3px] ${isPass ? "border-l-success bg-success-light/30" : "border-l-danger bg-danger-light/30"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium data-mono">{q.check_key}</span>
                    <span className={`badge ${isPass ? "badge--success" : "badge--danger"}`}>{isPass ? "PASS" : "FAIL"}</span>
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
        </SurfaceCard>
      </div>
    </SectionShell>
  );
}
