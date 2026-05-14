import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";
import { GovernanceSection } from "./components/GovernanceSection";
import { HeatmapSection } from "./components/HeatmapSection";
import { OpsProfileSection } from "./components/OpsProfileSection";
import { OverviewSection } from "./components/OverviewSection";
import { ReportingSection } from "./components/ReportingSection";
import { RiskMonitoringSection } from "./components/RiskMonitoringSection";
import { RouteSection } from "./components/RouteSection";
import {
  fetchDailyDistance,
  fetchDistanceBoxplot,
  fetchHeatmap,
  fetchHeatmapBuckets,
  fetchRouteCapability,
  fetchRouteCompare,
  fetchSpeedBoxplot,
  fetchSummary,
  fetchTripCount,
  fetchVehicleCount,
  fetchVehiclePath,
  type BoxRow,
  type DailyPoint,
  type HeatItem,
  type RouteCapability,
  type RoutePayload,
  type RouteResult,
  type SummaryRow,
  type VehiclePathSegment,
} from "./api";

type GeoJsonSourceLike = { setData: (data: unknown) => void };
type MapBounds = [[number, number], [number, number]];
type MapInstanceLike = {
  addControl: (control: unknown, position?: string) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource: (id: string) => unknown;
  getLayer: (id: string) => unknown;
  removeLayer: (id: string) => void;
  removeSource: (id: string) => void;
  setLayoutProperty: (id: string, name: string, value: string) => void;
  fitBounds: (bounds: MapBounds, opts: { padding: number; duration: number }) => void;
  remove: () => void;
  resize: () => void;
  getContainer?: () => HTMLDivElement | null;
};
type MaplibreModuleLike = { Map: new (cfg: unknown) => MapInstanceLike; NavigationControl: new () => unknown };
type ThemeMode = "dark" | "light";
type AppSection = "overview" | "heatmap" | "route" | "ops" | "risk" | "report" | "governance";
type RoutePickMode = "none" | "start" | "end";

const defaultRoutePayload: RoutePayload = {
  start_time: "2015-01-03T08:00:00",
  query_time: "2015-01-03T08:00:00",
  start_point: { lat: 45.756, lon: 126.642 },
  end_point: { lat: 45.721, lon: 126.588 },
};

const navItems: Array<{ id: AppSection; title: string; desc: string; icon: string; group: string }> = [
  { id: "overview", title: "总览", desc: "核心指标、趋势与箱线图", icon: "OV", group: "分析" },
  { id: "heatmap", title: "热力回放", desc: "道路流量时间桶", icon: "HM", group: "分析" },
  { id: "route", title: "路径对比", desc: "最短路与最快路", icon: "RT", group: "路径" },
  { id: "ops", title: "运营画像", desc: "车辆画像与活跃排行", icon: "OP", group: "运营" },
  { id: "risk", title: "风险监测", desc: "疲劳与异常运行", icon: "RK", group: "运营" },
  { id: "report", title: "运营报表", desc: "日报与周报", icon: "RP", group: "报表" },
  { id: "governance", title: "数据治理", desc: "资产与质量", icon: "GV", group: "治理" },
];

const mapTileTemplates = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_MAP_TILES ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png")
  .split(",")
  .map((item) => item.trim())
  .filter((item) => item.length > 0);

function parseLineStringWkt(wkt: string): number[][] | null {
  const m = wkt.trim().match(/^LINESTRING\s*\((.*)\)$/i);
  if (!m) return null;
  const points = m[1].split(",").map((p) => p.trim().split(/\s+/).map(Number)).filter((arr) => arr.length >= 2 && Number.isFinite(arr[0]) && Number.isFinite(arr[1])).map((arr) => [arr[0], arr[1]]);
  return points.length >= 2 ? points : null;
}

function App() {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [tripSeries, setTripSeries] = useState<DailyPoint[]>([]);
  const [vehicleSeries, setVehicleSeries] = useState<DailyPoint[]>([]);
  const [distanceSeries, setDistanceSeries] = useState<DailyPoint[]>([]);
  const [speedBox, setSpeedBox] = useState<BoxRow[]>([]);
  const [distanceBox, setDistanceBox] = useState<BoxRow[]>([]);
  const [routePayload, setRoutePayload] = useState<RoutePayload>(defaultRoutePayload);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("2015-01-03");
  const [buckets, setBuckets] = useState<string[]>([]);
  const [bucketIndex, setBucketIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [heatData, setHeatData] = useState<HeatItem[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [vehPath, setVehPath] = useState<VehiclePathSegment[] | null>(null);
  const [vehPathLoading, setVehPathLoading] = useState(false);
  const [bbox, setBbox] = useState<{ minLat: number; minLon: number; maxLat: number; maxLon: number } | null>(null);
  const [capability, setCapability] = useState<RouteCapability | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [showShortestOnMap, setShowShortestOnMap] = useState(true);
  const [showFastestOnMap, setShowFastestOnMap] = useState(true);
  const [showHeatmapOnMap, setShowHeatmapOnMap] = useState(true);
  const [heatmapPathOnly, setHeatmapPathOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const stored = window.localStorage?.getItem("theme-mode");
      return stored === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [activeSection, setActiveSection] = useState<AppSection>("overview");
  const [routePickMode, setRoutePickMode] = useState<RoutePickMode>("none");
  const [mapInitTick, setMapInitTick] = useState(0);

  const heatMapRef = useRef<MapInstanceLike | null>(null);
  const routeMapRef = useRef<MapInstanceLike | null>(null);
  const maplibreRef = useRef<MaplibreModuleLike | null>(null);
  const heatMapContainerRef = useRef<HTMLDivElement | null>(null);
  const routeMapContainerRef = useRef<HTMLDivElement | null>(null);
  const routePickModeRef = useRef<RoutePickMode>("none");

  useEffect(() => { routePickModeRef.current = routePickMode; }, [routePickMode]);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage?.setItem("theme-mode", theme);
    } catch {
      // noop
    }
  }, [theme]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [s, t, v, d, sb, db] = await Promise.all([fetchSummary(), fetchTripCount(), fetchVehicleCount(), fetchDailyDistance(), fetchSpeedBoxplot(), fetchDistanceBoxplot()]);
        setSummary(s); setTripSeries(t); setVehicleSeries(v); setDistanceSeries(d); setSpeedBox(sb); setDistanceBox(db);
      } catch (e) { setError(e instanceof Error ? e.message : "加载接口数据失败"); }
      finally { setLoading(false); }
    };
    void run();
  }, []);

  useEffect(() => {
    const run = async () => {
      setCapabilityError(null);
      try { setCapability(await fetchRouteCapability()); }
      catch (e) { setCapabilityError(e instanceof Error ? e.message : "加载路径能力信息失败"); }
    };
    void run();
  }, []);

  const initializeMap = useCallback(async (container: HTMLDivElement, targetRef: { current: MapInstanceLike | null }, variant: "heatmap" | "route") => {
    if (targetRef.current) return;
    const maplibre = maplibreRef.current ?? ((await import("maplibre-gl")).default as unknown as MaplibreModuleLike);
    maplibreRef.current = maplibre;
    const map = new maplibre.Map({
      container,
      style: { version: 8, sources: { osm: { type: "raster", tiles: mapTileTemplates, tileSize: 256, attribution: "© OpenStreetMap contributors" } }, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0a1324" } }, { id: "osm", type: "raster", source: "osm" }] },
      center: [126.64, 45.76], zoom: 11,
    });
    map.addControl(new maplibre.NavigationControl(), "top-right");
    map.on("load", () => {
      map.addSource("heat-lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "heat-lines-glow", type: "line", source: "heat-lines", paint: { "line-color": ["interpolate", ["linear"], ["coalesce", ["get", "flow_count"], 0], 1, "#49b7ff", 3, "#20f0ff", 6, "#ffc14f", 10, "#ff6c3f"], "line-width": ["interpolate", ["linear"], ["coalesce", ["get", "flow_count"], 0], 1, 3, 10, 12], "line-opacity": 0.35, "line-blur": 1.5 } });
      map.addLayer({ id: "heat-lines-layer", type: "line", source: "heat-lines", paint: { "line-color": ["interpolate", ["linear"], ["coalesce", ["get", "flow_count"], 0], 1, "#58b7ff", 3, "#22d3ee", 6, "#ffb74a", 10, "#ff7043"], "line-width": ["interpolate", ["linear"], ["coalesce", ["get", "flow_count"], 0], 1, 2.5, 10, 9], "line-opacity": 0.96 } });
      map.addSource("shortest-route-lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "shortest-route-lines-layer", type: "line", source: "shortest-route-lines", paint: { "line-color": "#00e0ff", "line-width": 6.5, "line-offset": -3, "line-dasharray": [1.4, 1.1], "line-opacity": 0.95 } });
      map.addSource("fastest-route-lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "fastest-route-lines-layer", type: "line", source: "fastest-route-lines", paint: { "line-color": "#ff9b3d", "line-width": 6.5, "line-offset": 3, "line-opacity": 0.92 } });
      map.addSource("route-points", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "route-points-layer", type: "circle", source: "route-points", paint: { "circle-radius": ["case", ["==", ["get", "kind"], "start"], 7, 6], "circle-color": ["case", ["==", ["get", "kind"], "start"], "#39ffaf", "#ff5f8f"], "circle-stroke-color": "#0b1322", "circle-stroke-width": 2 } });
      if (variant === "route") {
        map.on("click", (eventArg) => {
          const e = eventArg as { lngLat: { lat: number; lng: number } };
          const mode = routePickModeRef.current;
          if (mode === "none") return;
          const lat = Number(e.lngLat.lat.toFixed(6));
          const lon = Number(e.lngLat.lng.toFixed(6));
          setRoutePayload((prev) => mode === "start" ? { ...prev, start_point: { lat, lon } } : { ...prev, end_point: { lat, lon } });
        });
      }
      setMapInitTick((v) => v + 1);
    });
    targetRef.current = map;
  }, []);

  const ensureMapReady = useCallback(async (container: HTMLDivElement, targetRef: { current: MapInstanceLike | null }) => {
    const existingMap = targetRef.current;
    if (!existingMap) {
      await initializeMap(container, targetRef, targetRef === heatMapRef ? "heatmap" : "route");
      return;
    }
    const currentContainer = typeof existingMap.getContainer === "function" ? existingMap.getContainer() : null;
    if (currentContainer !== container) {
      existingMap.remove();
      targetRef.current = null;
      await initializeMap(container, targetRef, targetRef === heatMapRef ? "heatmap" : "route");
      return;
    }
    existingMap.resize();
  }, [initializeMap]);

  useEffect(() => {
    const setup = async () => {
      if (heatMapContainerRef.current) await ensureMapReady(heatMapContainerRef.current, heatMapRef);
      if (routeMapContainerRef.current) await ensureMapReady(routeMapContainerRef.current, routeMapRef);
      setMapInitTick((prev) => prev + 1);
    };
    void setup();
  }, [activeSection, ensureMapReady]);

  useEffect(() => { if (activeSection === "heatmap" && heatMapRef.current) window.setTimeout(() => heatMapRef.current?.resize(), 0); if (activeSection === "route" && routeMapRef.current) window.setTimeout(() => routeMapRef.current?.resize(), 0); }, [activeSection]);
  useEffect(() => () => { heatMapRef.current?.remove(); routeMapRef.current?.remove(); heatMapRef.current = null; routeMapRef.current = null; }, []);

  useEffect(() => {
    const run = async () => { try { setBuckets(await fetchHeatmapBuckets(selectedDate)); setBucketIndex(0); } catch (e) { setError(e instanceof Error ? e.message : "加载热力时间桶失败"); } };
    void run();
  }, [selectedDate]);

  useEffect(() => {
    if (activeSection !== "heatmap") return;
    if (!heatmapPathOnly || !vehicleId.trim()) return;
    const run = async () => {
      setVehPathLoading(true);
      try {
        setVehPath(await fetchVehiclePath(vehicleId.trim(), selectedDate));
      } catch (e) {
        setError(e instanceof Error ? e.message : "车辆路径加载失败");
      } finally {
        setVehPathLoading(false);
      }
    };
    void run();
  }, [activeSection, heatmapPathOnly, vehicleId, selectedDate]);

  useEffect(() => {
    if (activeSection !== "heatmap" || !heatmapPathOnly) return;
    setShowHeatmapOnMap(false);
    setHeatData([]);
  }, [activeSection, heatmapPathOnly]);

  useEffect(() => {
    const bucket = buckets[bucketIndex]; if (!bucket) return;
    const run = async () => {
      try { setHeatData(await fetchHeatmap({ metricDate: selectedDate, bucketStart: bucket, minLat: bbox?.minLat, minLon: bbox?.minLon, maxLat: bbox?.maxLat, maxLon: bbox?.maxLon })); }
      catch (e) { setError(e instanceof Error ? e.message : "加载热力图数据失败"); }
    };
    void run();
  }, [selectedDate, bucketIndex, buckets, bbox]);

  useEffect(() => {
    const map = heatMapRef.current; if (!map) return;
    const features = heatData.flatMap((item) => {
      try {
        const geom = JSON.parse(item.geometry);
        if (geom?.type === "MultiLineString") return (geom.coordinates as number[][][]).map((lineCoords) => ({ type: "Feature", properties: { road_id: item.road_id, road_name: item.road_name, flow_count: item.flow_count, distance_m: item.distance_m }, geometry: { type: "LineString", coordinates: lineCoords } }));
        if (geom?.type === "LineString") return [{ type: "Feature", properties: { road_id: item.road_id, road_name: item.road_name, flow_count: item.flow_count, distance_m: item.distance_m }, geometry: geom }];
      } catch { return []; }
      return [];
    });
    const src = map.getSource("heat-lines") as GeoJsonSourceLike | undefined; if (src) src.setData({ type: "FeatureCollection", features });
  }, [heatData, mapInitTick]);

  useEffect(() => {
    const map = heatMapRef.current; if (!map) return;
    try { map.getSource("vehicle-path-lines"); map.removeLayer("vehicle-path-lines"); } catch { /* ok */ }
    try { map.getSource("vehicle-path-source"); map.removeSource("vehicle-path-source"); } catch { /* ok */ }
    if (!vehPath || vehPath.length === 0) return;
    const features = vehPath.filter((s) => s.geometry).map((s) => { try { return { type: "Feature", properties: { road_id: s.road_id, speed: s.avg_speed_kmh }, geometry: JSON.parse(s.geometry) }; } catch { return null; } }).filter(Boolean);
    if (features.length === 0) return;
    map.addSource("vehicle-path-source", { type: "geojson", data: { type: "FeatureCollection", features } as unknown as Record<string, unknown> });
    map.addLayer({ id: "vehicle-path-lines", type: "line", source: "vehicle-path-source", paint: { "line-color": "#dc2626", "line-width": 3, "line-opacity": 0.8 } });
  }, [vehPath, mapInitTick]);

  useEffect(() => {
    const map = routeMapRef.current; if (!map) return;
    const shortestFeatures = (routeResult?.shortest_route?.path_wkt_segments ?? []).map((wkt) => parseLineStringWkt(wkt)).filter((coords): coords is number[][] => Array.isArray(coords)).map((coords) => ({ type: "Feature", properties: { route: "shortest" }, geometry: { type: "LineString", coordinates: coords } }));
    const fastestFeatures = (routeResult?.fastest_route?.path_wkt_segments ?? []).map((wkt) => parseLineStringWkt(wkt)).filter((coords): coords is number[][] => Array.isArray(coords)).map((coords) => ({ type: "Feature", properties: { route: "fastest" }, geometry: { type: "LineString", coordinates: coords } }));
    const shortestSource = map.getSource("shortest-route-lines") as GeoJsonSourceLike | undefined;
    const fastestSource = map.getSource("fastest-route-lines") as GeoJsonSourceLike | undefined;
    const pointsSource = map.getSource("route-points") as GeoJsonSourceLike | undefined;
    if (!shortestSource || !fastestSource || !pointsSource) return;
    shortestSource.setData({ type: "FeatureCollection", features: shortestFeatures });
    fastestSource.setData({ type: "FeatureCollection", features: fastestFeatures });
    pointsSource.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: { kind: "start" }, geometry: { type: "Point", coordinates: [routePayload.start_point.lon, routePayload.start_point.lat] } }, { type: "Feature", properties: { kind: "end" }, geometry: { type: "Point", coordinates: [routePayload.end_point.lon, routePayload.end_point.lat] } }] });
  }, [routeResult, routePayload, mapInitTick]);

  useEffect(() => {
    [heatMapRef.current, routeMapRef.current].filter((map): map is MapInstanceLike => map !== null).forEach((map) => {
      const isHeatMap = map === heatMapRef.current;
      const isRouteMap = map === routeMapRef.current;
      if (map.getLayer("heat-lines-layer")) map.setLayoutProperty("heat-lines-layer", "visibility", isHeatMap && showHeatmapOnMap ? "visible" : "none");
      if (map.getLayer("heat-lines-glow")) map.setLayoutProperty("heat-lines-glow", "visibility", isHeatMap && showHeatmapOnMap ? "visible" : "none");
      if (map.getLayer("shortest-route-lines-layer")) map.setLayoutProperty("shortest-route-lines-layer", "visibility", isRouteMap && showShortestOnMap ? "visible" : "none");
      if (map.getLayer("fastest-route-lines-layer")) map.setLayoutProperty("fastest-route-lines-layer", "visibility", isRouteMap && showFastestOnMap ? "visible" : "none");
      if (map.getLayer("route-points-layer")) map.setLayoutProperty("route-points-layer", "visibility", isRouteMap && (showShortestOnMap || showFastestOnMap) ? "visible" : "none");
    });
  }, [showHeatmapOnMap, showShortestOnMap, showFastestOnMap, mapInitTick]);

  useEffect(() => { [heatMapRef.current, routeMapRef.current].filter((map): map is MapInstanceLike => map !== null).forEach((map) => { if (bbox) map.fitBounds([[bbox.minLon, bbox.minLat], [bbox.maxLon, bbox.maxLat]], { padding: 20, duration: 500 }); }); }, [bbox, mapInitTick]);
  useEffect(() => { if (!isPlaying || buckets.length <= 1) return; const timer = window.setInterval(() => setBucketIndex((prev) => (prev + 1) % buckets.length), 900); return () => window.clearInterval(timer); }, [isPlaying, buckets.length]);

  const kpis = useMemo(() => summary.length ? { tripCount: summary.reduce((acc, cur) => acc + cur.trip_count, 0), vehicleCount: Math.max(...summary.map((x) => x.vehicle_count)), distanceKm: summary.reduce((acc, cur) => acc + cur.distance_km, 0) } : { tripCount: 0, vehicleCount: 0, distanceKm: 0 }, [summary]);
  const onRunRoute = async () => { setError(null); try { if (!capability?.ready) throw new Error(capability?.issues?.join("; ") || "路径能力未就绪"); setRouteResult(await fetchRouteCompare(routePayload)); } catch (e) { setError(e instanceof Error ? e.message : "路径对比接口调用失败"); } };
  const clearRouteOnMap = () => { setShowShortestOnMap(false); setShowFastestOnMap(false); };
  const clearRouteResult = () => setRouteResult(null);
  const clearHeatmapLayer = () => { setShowHeatmapOnMap(false); setHeatData([]); };
  const restoreHeatmapLayer = () => setShowHeatmapOnMap(true);
  const routeOverlap = useMemo(() => { const s = routeResult?.shortest_route?.path_wkt_segments ?? []; const f = routeResult?.fastest_route?.path_wkt_segments ?? []; return s.length > 0 && s.length === f.length && s.every((seg, i) => seg === f[i]); }, [routeResult]);
  const routeErrorHint = useMemo(() => error && error.toLowerCase().includes("no traversable path") ? "当前点位在路网断连区域，建议在路径地图中使用“选择起点/选择终点”重新选点到附近道路节点。" : null, [error]);
  const navGroups = useMemo(() => navItems.reduce<Record<string, typeof navItems>>((acc, item) => { if (!acc[item.group]) acc[item.group] = []; acc[item.group].push(item); return acc; }, {}), []);

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">哈尔滨车辆行程分析平台</p>
          <h1>工作台</h1>
          <p className="sidebar-note">点击左侧模块，聚焦单一业务流程。</p>
        </div>

        <nav className="sidebar-nav" aria-label="仪表盘模块导航">
          {Object.entries(navGroups).map(([group, items]) => (
            <div key={group} className="nav-group">
              <p className="nav-group-title">{group}</p>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item ${activeSection === item.id ? "active" : ""}`}
                  onClick={() => setActiveSection(item.id)}
                >
                  <span className="nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="nav-copy">
                    <span className="nav-title">{item.title}</span>
                    <span className="nav-desc">{item.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="theme-switch">
          <span>主题</span>
          <div className="theme-buttons" role="group" aria-label="主题切换">
            <button type="button" className={`theme-btn ${theme === "light" ? "active" : ""}`} onClick={() => setTheme("light")}>
              浅色
            </button>
            <button type="button" className={`theme-btn ${theme === "dark" ? "active" : ""}`} onClick={() => setTheme("dark")}>
              深色
            </button>
          </div>
          <div className="theme-hint">切换后页面会立即同步到对应主题</div>
        </div>
      </aside>
      <section className="content">
        <header className="content-header">
          <h2>{navItems.find((item) => item.id === activeSection)?.title}</h2>
          <p>基于 H5 + JLD2 合并入仓，依托 PostGIS 统计能力，支持最短路与最快路的路径对比。</p>
        </header>
        {error ? <section className="error">{error}</section> : null}
        {loading ? <section className="loading">正在加载后端数据...</section> : null}
        <div key={activeSection} className="panel-fade">
          {activeSection === "overview" ? <OverviewSection tripCount={kpis.tripCount} vehicleCount={kpis.vehicleCount} distanceKm={kpis.distanceKm} tripSeries={tripSeries} vehicleSeries={vehicleSeries} distanceSeries={distanceSeries} speedBox={speedBox} distanceBox={distanceBox} /> : null}
          {activeSection === "heatmap" ? <HeatmapSection selectedDate={selectedDate} setSelectedDate={setSelectedDate} bucketIndex={bucketIndex} setBucketIndex={setBucketIndex} buckets={buckets} isPlaying={isPlaying} setIsPlaying={setIsPlaying} showHeatmapOnMap={showHeatmapOnMap} onClearHeatmap={clearHeatmapLayer} onRestoreHeatmap={restoreHeatmapLayer} vehicleId={vehicleId} setVehicleId={(value) => { setVehicleId(value); setHeatmapPathOnly(false); }} vehPathLoading={vehPathLoading} onLoadVehiclePath={async () => { if (!vehicleId.trim()) return; setHeatmapPathOnly(true); setActiveSection("heatmap"); setVehPathLoading(true); try { setVehPath(await fetchVehiclePath(vehicleId.trim(), selectedDate)); } catch (e) { setError(e instanceof Error ? e.message : "车辆路径加载失败"); } finally { setVehPathLoading(false); } }} vehPath={vehPath} onClearVehiclePath={() => { setVehPath(null); setHeatmapPathOnly(false); setShowHeatmapOnMap(true); }} onZoomToBbox={() => setBbox({ minLat: 45.7, minLon: 126.55, maxLat: 45.82, maxLon: 126.75 })} onResetBbox={() => setBbox(null)} pathMode={heatmapPathOnly} heatMapContainerRef={heatMapContainerRef} /> : null}
          {activeSection === "route" ? <RouteSection capability={capability} capabilityError={capabilityError} routePayload={routePayload} setRoutePayload={setRoutePayload} routeResult={routeResult} onRunRoute={onRunRoute} clearRouteOnMap={clearRouteOnMap} clearRouteResult={clearRouteResult} showShortestOnMap={showShortestOnMap} setShowShortestOnMap={setShowShortestOnMap} showFastestOnMap={showFastestOnMap} setShowFastestOnMap={setShowFastestOnMap} routeOverlap={routeOverlap} routeErrorHint={routeErrorHint} routePickMode={routePickMode} setRoutePickMode={setRoutePickMode} routeMapContainerRef={routeMapContainerRef} /> : null}
          {activeSection === "ops" ? <section className="panel-fade"><OpsProfileSection /></section> : null}
          {activeSection === "risk" ? <section className="panel-fade"><RiskMonitoringSection onViewPath={async (driverId) => { setVehicleId(driverId); setHeatmapPathOnly(true); setActiveSection("heatmap"); }} /></section> : null}
          {activeSection === "report" ? <section className="panel-fade"><ReportingSection /></section> : null}
          {activeSection === "governance" ? <section className="panel-fade"><GovernanceSection /></section> : null}
        </div>
      </section>
    </main>
  );
}

export default App;
