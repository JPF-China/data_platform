import type { RefObject } from "react";
import { SectionShell } from "./Ui";

type HeatmapSectionProps = {
  selectedDate: string;
  setSelectedDate: (value: string) => void;
  bucketIndex: number;
  setBucketIndex: (value: number) => void;
  buckets: string[];
  isPlaying: boolean;
  setIsPlaying: (value: boolean) => void;
  showHeatmapOnMap: boolean;
  onClearHeatmap: () => void;
  onRestoreHeatmap: () => void;
  vehicleId: string;
  setVehicleId: (value: string) => void;
  vehPathLoading: boolean;
  onLoadVehiclePath: () => void;
  vehPath: unknown[] | null;
  onClearVehiclePath: () => void;
  onZoomToBbox: () => void;
  onResetBbox: () => void;
  pathMode?: boolean;
  heatMapContainerRef: RefObject<HTMLDivElement | null>;
};

export function HeatmapSection({
  selectedDate,
  setSelectedDate,
  bucketIndex,
  setBucketIndex,
  buckets,
  isPlaying,
  setIsPlaying,
  showHeatmapOnMap,
  onClearHeatmap,
  onRestoreHeatmap,
  vehicleId,
  setVehicleId,
  vehPathLoading,
  onLoadVehiclePath,
  vehPath,
  onClearVehiclePath,
  onZoomToBbox,
  onResetBbox,
  pathMode = false,
  heatMapContainerRef,
}: HeatmapSectionProps) {
  if (pathMode) {
    return (
      <SectionShell title="热力回放" description="当前仅显示车辆路径">
        <div className="vehicle-path-search">
          <input
            type="text"
            placeholder="输入车辆ID查看路径..."
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
          />
          <button type="button" className="secondary-btn" onClick={onLoadVehiclePath} disabled={vehPathLoading}>
            {vehPathLoading ? "加载中..." : "查看路径"}
          </button>
          {vehPath ? (
            <button type="button" className="secondary-btn" onClick={onClearVehiclePath}>
              清空
            </button>
          ) : null}
          {vehPath ? <span className="pick-tip">{vehPath.length} 段路径</span> : null}
        </div>

        <div className="map-wrap">
          <div className="map-head">车辆路径回放（MapLibre GL）</div>
          <div ref={heatMapContainerRef} className="map-canvas" />
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell title="热力回放" description="道路流量时间桶、车辆路径叠加与范围筛选">
      <div className="playback-controls">
        <label>
          日期
          <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>
            {[
              "2015-01-03",
              "2015-01-04",
              "2015-01-05",
              "2015-01-06",
              "2015-01-07",
            ].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label>
          起始时间桶
          <input
            type="number"
            min={0}
            max={Math.max(0, buckets.length - 1)}
            value={bucketIndex}
            onChange={(e) => setBucketIndex(Number(e.target.value))}
          />
        </label>
        <button type="button" onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? "暂停" : "播放"}
        </button>
        <button type="button" onClick={onZoomToBbox}>缩放到框选范围</button>
        <button type="button" onClick={onResetBbox}>重置范围</button>
      </div>

      <div className="heatmap-toolbar">
        <div className="heat-legend" aria-label="热力图流量图例">
          <span className="legend-chip smooth">畅通</span>
          <span className="legend-chip busy">繁忙</span>
          <span className="legend-chip congested">拥堵</span>
        </div>
        {pathMode ? (
          <span className="pick-tip">当前仅显示车辆路径</span>
        ) : showHeatmapOnMap ? (
          <button type="button" className="secondary-btn" onClick={onClearHeatmap}>
            清空热力图
          </button>
        ) : (
          <button type="button" className="secondary-btn" onClick={onRestoreHeatmap}>
            恢复热力图
          </button>
        )}
      </div>

      <div className="vehicle-path-search">
        <input
          type="text"
          placeholder="输入车辆ID查看路径..."
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
        />
        <button type="button" className="secondary-btn" onClick={onLoadVehiclePath} disabled={vehPathLoading}>
          {vehPathLoading ? "加载中..." : "查看路径"}
        </button>
        {vehPath ? (
          <button type="button" className="secondary-btn" onClick={onClearVehiclePath}>
            清空
          </button>
        ) : null}
        {vehPath ? <span className="pick-tip">{vehPath.length} 段路径</span> : null}
      </div>

      <div className="map-wrap">
        <div className="map-head">{pathMode ? "车辆路径回放（MapLibre GL）" : "道路流量热力图（MapLibre GL）"}</div>
        <div ref={heatMapContainerRef} className="map-canvas" />
      </div>
      {pathMode ? <p className="bucket-tip">仅展示该车辆路径</p> : <p className="bucket-tip">当前时间桶：{buckets[bucketIndex] ?? "暂无"}</p>}
    </SectionShell>
  );
}
