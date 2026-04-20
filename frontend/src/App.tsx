import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";
import {
  fetchCongestionAvoidanceRecommendation,
  fetchCrowdProfileSummary,
  fetchCrowdSegments,
  fetchCrowdVehicles,
  fetchDailyDistance,
  fetchDepartureWindowRecommendation,
  fetchDistanceBoxplot,
  fetchHeatmap,
  fetchLatestJobStatus,
  fetchMetaAssets,
  fetchMetaDates,
  fetchMetaHeatmapBuckets,
  fetchMetaPortalSummary,
  fetchRouteCapability,
  fetchRouteCompare,
  fetchRouteRecommendation,
  fetchSpeedBoxplot,
  fetchSummary,
  fetchTripCount,
  fetchVehicleCount,
  type BoxRow,
  type CongestionAvoidanceRecommendation,
  type CrowdProfileSummary,
  type CrowdSegment,
  type CrowdVehicle,
  type DailyPoint,
  type DepartureWindowRecommendation,
  type HeatItem,
  type MetaAsset,
  type MetaDates,
  type MetaJob,
  type MetaPortalSummary,
  type RouteRecommendation,
  type RouteCapability,
  type RoutePayload,
  type RouteResult,
  type SummaryRow,
} from "./api";

type GeoJsonSourceLike = { setData: (data: unknown) => void };
type MapBounds = [[number, number], [number, number]];
type MapBBox = {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
};
type MapInstanceLike = {
  addControl: (control: unknown, position?: string) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource: (id: string) => unknown;
  getLayer: (id: string) => unknown;
  setLayoutProperty: (id: string, name: string, value: string) => void;
  fitBounds: (bounds: MapBounds, opts: { padding: number; duration: number }) => void;
  remove: () => void;
  resize: () => void;
  getContainer?: () => HTMLDivElement | null;
};
type MaplibreModuleLike = {
  Map: new (cfg: unknown) => MapInstanceLike;
  NavigationControl: new () => unknown;
};
type ThemeMode = "dark" | "light";
type AppSection =
  | "assets"
  | "overview"
  | "heatmap"
  | "route"
  | "recommend"
  | "crowd"
  | "bigscreen";
type RoutePickMode = "none" | "start" | "end";

const tooltipValue = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const safeNum = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const assetStatusLabel = (status: string): string => {
  if (status === "ready") return "已就绪";
  if (status === "missing") return "缺失";
  if (status === "empty") return "空表";
  return status;
};

const tooltipTheme = {
  contentStyle: {
    background: "var(--bg-panel-soft)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    color: "var(--text-main)",
  },
  labelStyle: {
    color: "var(--text-main)",
    fontWeight: 700,
  },
  itemStyle: {
    color: "var(--text-dim)",
  },
};

function BoxplotMini({ data, unit }: { data: BoxRow[]; unit: string }) {
  const [hoverText, setHoverText] = useState<string>("");
  if (!data.length) return <div className="empty">暂无箱线图数据</div>;
  const all = data
    .flatMap((d) => [d.min_value, d.q1, d.median, d.q3, d.max_value])
    .filter((v) => Number.isFinite(v));
  if (!all.length) return <div className="empty">暂无箱线图数据</div>;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const height = 210;
  const width = 520;
  const chartTop = 14;
  const chartBottom = 186;
  const usableH = chartBottom - chartTop;
  const band = width / data.length;
  const y = (v: number) =>
    chartBottom - ((v - min) / Math.max(1e-9, max - min)) * usableH;

  const rows = data.filter((d) =>
    [d.min_value, d.q1, d.median, d.q3, d.max_value].every((v) =>
      Number.isFinite(v)
    )
  );
  return (
    <div className="boxplot-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="boxplot-svg">
        {rows.map((d, i) => {
          const cx = i * band + band / 2;
          const boxW = Math.min(34, band * 0.45);
          return (
            <g key={`${d.trip_date}-${i}`}>
              <line
                x1={cx}
                x2={cx}
                y1={y(d.min_value)}
                y2={y(d.max_value)}
                stroke="var(--plot-line)"
                strokeWidth={1.4}
              />
              <line
                x1={cx - boxW / 2}
                x2={cx + boxW / 2}
                y1={y(d.max_value)}
                y2={y(d.max_value)}
                stroke="var(--plot-line)"
                strokeWidth={1.2}
              />
              <line
                x1={cx - boxW / 2}
                x2={cx + boxW / 2}
                y1={y(d.min_value)}
                y2={y(d.min_value)}
                stroke="var(--plot-line)"
                strokeWidth={1.2}
              />
              <rect
                x={cx - boxW / 2}
                y={y(d.q3)}
                width={boxW}
                height={Math.max(2, y(d.q1) - y(d.q3))}
                fill="var(--plot-box-bg)"
                stroke="var(--plot-box-line)"
                strokeWidth={1.2}
                onMouseEnter={() =>
                  setHoverText(
                    `${d.trip_date} | min=${d.min_value.toFixed(2)} ${unit}, q1=${d.q1.toFixed(2)} ${unit}, median=${d.median.toFixed(2)} ${unit}, q3=${d.q3.toFixed(2)} ${unit}, max=${d.max_value.toFixed(2)} ${unit}, n=${d.sample_count}`
                  )
                }
                onMouseLeave={() => setHoverText("")}
              />
              <line
                x1={cx - boxW / 2}
                x2={cx + boxW / 2}
                y1={y(d.median)}
                y2={y(d.median)}
                stroke="var(--plot-median)"
                strokeWidth={1.8}
              />
              <title>{`${d.trip_date} min:${d.min_value.toFixed(2)} ${unit}, q1:${d.q1.toFixed(2)} ${unit}, median:${d.median.toFixed(2)} ${unit}, q3:${d.q3.toFixed(2)} ${unit}, max:${d.max_value.toFixed(2)} ${unit}, n:${d.sample_count}`}</title>
              <text x={cx} y={202} textAnchor="middle" className="boxplot-label">
                {(d.trip_date ?? "").slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="boxplot-hover">
        {hoverText || "悬停箱体可查看精确数值"}
      </div>
    </div>
  );
}

const defaultRoutePayload: RoutePayload = {
  start_time: "",
  query_time: "",
  start_point: { lat: 45.756, lon: 126.642 },
  end_point: { lat: 45.721, lon: 126.588 },
};

const buildRouteDateTime = (dateText: string): string => `${dateText}T08:00:00`;

const navItems: Array<{
  id: AppSection;
  title: string;
  desc: string;
  icon: string;
  group: string;
}> = [
  {
    id: "assets",
    title: "资产门户",
    desc: "四层资产与状态总览",
    icon: "AS",
    group: "门户",
  },
  {
    id: "overview",
    title: "总览",
    desc: "核心指标、趋势与箱线图",
    icon: "OV",
    group: "分析",
  },
  {
    id: "heatmap",
    title: "热力回放",
    desc: "道路流量时间桶",
    icon: "HM",
    group: "分析",
  },
  {
    id: "route",
    title: "路径对比",
    desc: "最短路与最快路",
    icon: "RT",
    group: "路径",
  },
  {
    id: "recommend",
    title: "推荐中心",
    desc: "路径、时段与避堵建议",
    icon: "RC",
    group: "路径",
  },
  {
    id: "crowd",
    title: "圈人中心",
    desc: "车辆标签与道路热点",
    icon: "CD",
    group: "圈人",
  },
  {
    id: "bigscreen",
    title: "答辩大屏",
    desc: "自动轮播与全屏展示",
    icon: "BS",
    group: "展示",
  },
];

const mapTileTemplates = (
  (
    import.meta as unknown as {
      env?: Record<string, string | undefined>;
    }
  ).env?.VITE_MAP_TILES ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
)
  .split(",")
  .map((item) => item.trim())
  .filter((item) => item.length > 0);

function parseLineStringWkt(wkt: string): number[][] | null {
  const m = wkt.trim().match(/^LINESTRING\s*\((.*)\)$/i);
  if (!m) return null;
  const points = m[1]
    .split(",")
    .map((p) => p.trim().split(/\s+/).map(Number))
    .filter(
      (arr) => arr.length >= 2 && Number.isFinite(arr[0]) && Number.isFinite(arr[1])
    )
    .map((arr) => [arr[0], arr[1]]);
  return points.length >= 2 ? points : null;
}

function parseGeometryBounds(geometryText?: string | null): MapBBox | null {
  if (!geometryText) return null;
  try {
    const geom = JSON.parse(geometryText) as {
      type?: string;
      coordinates?: unknown;
    };
    const coords: number[][] = [];
    if (geom?.type === "LineString" && Array.isArray(geom.coordinates)) {
      for (const point of geom.coordinates) {
        if (
          Array.isArray(point) &&
          point.length >= 2 &&
          typeof point[0] === "number" &&
          typeof point[1] === "number"
        ) {
          coords.push([point[0], point[1]]);
        }
      }
    }
    if (geom?.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
      for (const line of geom.coordinates) {
        if (!Array.isArray(line)) continue;
        for (const point of line) {
          if (
            Array.isArray(point) &&
            point.length >= 2 &&
            typeof point[0] === "number" &&
            typeof point[1] === "number"
          ) {
            coords.push([point[0], point[1]]);
          }
        }
      }
    }
    if (!coords.length) return null;
    const lons = coords.map((item) => item[0]);
    const lats = coords.map((item) => item[1]);
    return {
      minLat: Math.min(...lats) - 0.01,
      minLon: Math.min(...lons) - 0.01,
      maxLat: Math.max(...lats) + 0.01,
      maxLon: Math.max(...lons) + 0.01,
    };
  } catch {
    return null;
  }
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
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [buckets, setBuckets] = useState<string[]>([]);
  const [bucketIndex, setBucketIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [heatData, setHeatData] = useState<HeatItem[]>([]);
  const [bbox, setBbox] = useState<{
    minLat: number;
    minLon: number;
    maxLat: number;
    maxLon: number;
  } | null>(null);
  const [capability, setCapability] = useState<RouteCapability | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [metaAssets, setMetaAssets] = useState<MetaAsset[]>([]);
  const [metaDates, setMetaDates] = useState<MetaDates | null>(null);
  const [metaPortalSummary, setMetaPortalSummary] = useState<MetaPortalSummary | null>(
    null
  );
  const [latestJob, setLatestJob] = useState<MetaJob | null>(null);
  const [crowdSummary, setCrowdSummary] = useState<CrowdProfileSummary | null>(null);
  const [crowdVehicles, setCrowdVehicles] = useState<CrowdVehicle[]>([]);
  const [crowdSegments, setCrowdSegments] = useState<CrowdSegment[]>([]);
  const [selectedCrowdTag, setSelectedCrowdTag] = useState<string>("");
  const [routeRecommendation, setRouteRecommendation] =
    useState<RouteRecommendation | null>(null);
  const [departureRecommendation, setDepartureRecommendation] =
    useState<DepartureWindowRecommendation | null>(null);
  const [congestionRecommendation, setCongestionRecommendation] =
    useState<CongestionAvoidanceRecommendation | null>(null);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [showShortestOnMap, setShowShortestOnMap] = useState(true);
  const [showFastestOnMap, setShowFastestOnMap] = useState(true);
  const [showHeatmapOnMap, setShowHeatmapOnMap] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [activeSection, setActiveSection] = useState<AppSection>("overview");
  const [routePickMode, setRoutePickMode] = useState<RoutePickMode>("none");
  const [mapInitTick, setMapInitTick] = useState(0);
  const [bigScreenSlide, setBigScreenSlide] = useState(0);
  const [bigScreenAutoPlay, setBigScreenAutoPlay] = useState(true);
  const [bigScreenFocus, setBigScreenFocus] = useState(false);

  const workspaceRef = useRef<HTMLElement | null>(null);
  const heatMapRef = useRef<MapInstanceLike | null>(null);
  const routeMapRef = useRef<MapInstanceLike | null>(null);
  const maplibreRef = useRef<MaplibreModuleLike | null>(null);
  const heatMapContainerRef = useRef<HTMLDivElement | null>(null);
  const routeMapContainerRef = useRef<HTMLDivElement | null>(null);
  const routePickModeRef = useRef<RoutePickMode>("none");

  useEffect(() => {
    routePickModeRef.current = routePickMode;
  }, [routePickMode]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [s, t, v, d, sb, db] = await Promise.all([
          fetchSummary(),
          fetchTripCount(),
          fetchVehicleCount(),
          fetchDailyDistance(),
          fetchSpeedBoxplot(),
          fetchDistanceBoxplot(),
        ]);
        setSummary(s);
        setTripSeries(t);
        setVehicleSeries(v);
        setDistanceSeries(d);
        setSpeedBox(sb);
        setDistanceBox(db);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载接口数据失败");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        const [dates, assets, portalSummary, job] = await Promise.all([
          fetchMetaDates(),
          fetchMetaAssets(),
          fetchMetaPortalSummary().catch(() => null),
          fetchLatestJobStatus(),
        ]);
        setMetaDates(dates);
        setMetaAssets(assets);
        setMetaPortalSummary(portalSummary);
        setLatestJob(job);

        const defaultHeatmapDate =
          dates.default_heatmap_date ??
          dates.heatmap_dates[0] ??
          dates.default_summary_date ??
          dates.summary_dates[0] ??
          "";
        if (defaultHeatmapDate) {
          setSelectedDate((prev) => prev || defaultHeatmapDate);
        }

        const defaultRouteDate =
          dates.default_route_date ??
          dates.route_dates[0] ??
          defaultHeatmapDate;
        if (defaultRouteDate) {
          setRoutePayload((prev) => ({
            ...prev,
            start_time: prev.start_time || buildRouteDateTime(defaultRouteDate),
            query_time: prev.query_time || buildRouteDateTime(defaultRouteDate),
          }));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载元数据失败");
      }
    };
    void run();
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        const summaryData = await fetchCrowdProfileSummary();
        setCrowdSummary(summaryData);
        if (summaryData.items.length) {
          setSelectedCrowdTag((prev) => prev || summaryData.items[0].tag_code);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载圈人画像失败");
      }
    };
    void run();
  }, []);

  useEffect(() => {
    const run = async () => {
      setCapabilityError(null);
      try {
        setCapability(await fetchRouteCapability());
      } catch (e) {
        setCapabilityError(
          e instanceof Error ? e.message : "加载路径能力信息失败"
        );
      }
    };
    void run();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setBigScreenFocus(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  const initializeMap = useCallback(async (
    container: HTMLDivElement,
    targetRef: { current: MapInstanceLike | null },
    variant: "heatmap" | "route"
  ) => {
    if (targetRef.current) return;
    const maplibre =
      maplibreRef.current ??
      ((await import("maplibre-gl")).default as unknown as MaplibreModuleLike);
    maplibreRef.current = maplibre;

    const map = new maplibre.Map({
      container,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: mapTileTemplates,
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "bg",
            type: "background",
            paint: {
              "background-color": "#0a1324",
            },
          },
          { id: "osm", type: "raster", source: "osm" },
        ],
      },
      center: [126.64, 45.76],
      zoom: 11,
    });
    map.addControl(new maplibre.NavigationControl(), "top-right");
    map.on("load", () => {
      map.addSource("heat-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "heat-lines-glow",
        type: "line",
        source: "heat-lines",
        paint: {
          "line-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "flow_count"], 0],
            1,
            "#49b7ff",
            3,
            "#20f0ff",
            6,
            "#ffc14f",
            10,
            "#ff6c3f",
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "flow_count"], 0],
            1,
            3,
            10,
            12,
          ],
          "line-opacity": 0.35,
          "line-blur": 1.5,
        },
      });
      map.addLayer({
        id: "heat-lines-layer",
        type: "line",
        source: "heat-lines",
        paint: {
          "line-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "flow_count"], 0],
            1,
            "#58b7ff",
            3,
            "#22d3ee",
            6,
            "#ffb74a",
            10,
            "#ff7043",
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "flow_count"], 0],
            1,
            2.5,
            10,
            9,
          ],
          "line-opacity": 0.96,
        },
      });

      map.addSource("shortest-route-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "shortest-route-lines-layer",
        type: "line",
        source: "shortest-route-lines",
        paint: {
          "line-color": "#00e0ff",
          "line-width": 6.5,
          "line-offset": -3,
          "line-dasharray": [1.4, 1.1],
          "line-opacity": 0.95,
        },
      });

      map.addSource("fastest-route-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "fastest-route-lines-layer",
        type: "line",
        source: "fastest-route-lines",
        paint: {
          "line-color": "#ff9b3d",
          "line-width": 6.5,
          "line-offset": 3,
          "line-opacity": 0.92,
        },
      });

      map.addSource("route-points", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "route-points-layer",
        type: "circle",
        source: "route-points",
        paint: {
          "circle-radius": ["case", ["==", ["get", "kind"], "start"], 7, 6],
          "circle-color": [
            "case",
            ["==", ["get", "kind"], "start"],
            "#39ffaf",
            "#ff5f8f",
          ],
          "circle-stroke-color": "#0b1322",
          "circle-stroke-width": 2,
        },
      });

      if (variant === "route") {
        map.on("click", (eventArg) => {
          const e = eventArg as { lngLat: { lat: number; lng: number } };
          const mode = routePickModeRef.current;
          if (mode === "none") return;
          const lat = Number(e.lngLat.lat.toFixed(6));
          const lon = Number(e.lngLat.lng.toFixed(6));
          setRoutePayload((prev) => {
            if (mode === "start") {
              return {
                ...prev,
                start_point: { lat, lon },
              };
            }
            return {
              ...prev,
              end_point: { lat, lon },
            };
          });
        });
      }
      setMapInitTick((v) => v + 1);
    });
    targetRef.current = map;
  }, []);

  const ensureMapReady = useCallback(async (
    container: HTMLDivElement,
    targetRef: { current: MapInstanceLike | null }
  ) => {
    const existingMap = targetRef.current;
    if (!existingMap) {
      await initializeMap(container, targetRef, targetRef === heatMapRef ? "heatmap" : "route");
      return;
    }

    const currentContainer =
      typeof existingMap.getContainer === "function"
        ? existingMap.getContainer()
        : null;

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
      if (heatMapContainerRef.current) {
        await ensureMapReady(heatMapContainerRef.current, heatMapRef);
      }
      if (routeMapContainerRef.current) {
        await ensureMapReady(routeMapContainerRef.current, routeMapRef);
      }
    };
    void setup();
  }, [activeSection, ensureMapReady]);

  useEffect(() => {
    if (activeSection === "heatmap" && heatMapRef.current) {
      window.setTimeout(() => heatMapRef.current?.resize(), 0);
    }
    if (activeSection === "route" && routeMapRef.current) {
      window.setTimeout(() => routeMapRef.current?.resize(), 0);
    }
  }, [activeSection]);

  useEffect(() => {
    return () => {
      if (heatMapRef.current) {
        heatMapRef.current.remove();
        heatMapRef.current = null;
      }
      if (routeMapRef.current) {
        routeMapRef.current.remove();
        routeMapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const run = async () => {
      if (!selectedDate) {
        setBuckets([]);
        setBucketIndex(0);
        return;
      }
      try {
        const items = await fetchMetaHeatmapBuckets(selectedDate);
        setBuckets(items);
        setBucketIndex(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载热力时间桶失败");
      }
    };
    void run();
  }, [selectedDate]);

  useEffect(() => {
    const bucket = buckets[bucketIndex];
    if (!bucket) return;
    const run = async () => {
      try {
        setHeatData(
          await fetchHeatmap({
            metricDate: selectedDate,
            bucketStart: bucket,
            minLat: bbox?.minLat,
            minLon: bbox?.minLon,
            maxLat: bbox?.maxLat,
            maxLon: bbox?.maxLon,
          })
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载热力图数据失败");
      }
    };
    void run();
  }, [selectedDate, bucketIndex, buckets, bbox]);

  useEffect(() => {
    const map = heatMapRef.current;
    if (!map) return;
    const features = heatData.flatMap((item) => {
      try {
        const geom = JSON.parse(item.geometry);
        if (geom?.type === "MultiLineString") {
          return (geom.coordinates as number[][][]).map((lineCoords) => ({
            type: "Feature",
            properties: {
              road_id: item.road_id,
              road_name: item.road_name,
              flow_count: item.flow_count,
              distance_m: item.distance_m,
            },
            geometry: { type: "LineString", coordinates: lineCoords },
          }));
        }
        if (geom?.type === "LineString") {
          return [
            {
              type: "Feature",
              properties: {
                road_id: item.road_id,
                road_name: item.road_name,
                flow_count: item.flow_count,
                distance_m: item.distance_m,
              },
              geometry: geom,
            },
          ];
        }
      } catch {
        return [];
      }
      return [];
    });
    const src = map.getSource("heat-lines") as GeoJsonSourceLike | undefined;
    if (src) {
      src.setData({ type: "FeatureCollection", features });
    }
  }, [heatData, mapInitTick]);

  useEffect(() => {
    const map = routeMapRef.current;
    if (!map) return;

    const shortestFeatures = (routeResult?.shortest_route?.path_wkt_segments ?? [])
      .map((wkt) => parseLineStringWkt(wkt))
      .filter((coords): coords is number[][] => Array.isArray(coords))
      .map((coords) => ({
        type: "Feature",
        properties: { route: "shortest" },
        geometry: { type: "LineString", coordinates: coords },
      }));

    const fastestFeatures = (routeResult?.fastest_route?.path_wkt_segments ?? [])
      .map((wkt) => parseLineStringWkt(wkt))
      .filter((coords): coords is number[][] => Array.isArray(coords))
      .map((coords) => ({
        type: "Feature",
        properties: { route: "fastest" },
        geometry: { type: "LineString", coordinates: coords },
      }));

    const shortestSource = map.getSource("shortest-route-lines") as
      | GeoJsonSourceLike
      | undefined;
    const fastestSource = map.getSource("fastest-route-lines") as
      | GeoJsonSourceLike
      | undefined;
    const pointsSource = map.getSource("route-points") as
      | GeoJsonSourceLike
      | undefined;
    if (!shortestSource || !fastestSource || !pointsSource) return;

    shortestSource.setData({
      type: "FeatureCollection",
      features: shortestFeatures,
    });
    fastestSource.setData({
      type: "FeatureCollection",
      features: fastestFeatures,
    });

    pointsSource.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { kind: "start" },
          geometry: {
            type: "Point",
            coordinates: [routePayload.start_point.lon, routePayload.start_point.lat],
          },
        },
        {
          type: "Feature",
          properties: { kind: "end" },
          geometry: {
            type: "Point",
            coordinates: [routePayload.end_point.lon, routePayload.end_point.lat],
          },
        },
      ],
    });
  }, [routeResult, routePayload, mapInitTick]);

  useEffect(() => {
    const maps = [heatMapRef.current, routeMapRef.current].filter(
      (map): map is MapInstanceLike => map !== null
    );
    maps.forEach((map) => {
      const isHeatMap = map === heatMapRef.current;
      const isRouteMap = map === routeMapRef.current;
      const heatVisibility = isHeatMap && showHeatmapOnMap ? "visible" : "none";
      const routeVisibility = isRouteMap;
      if (map.getLayer("heat-lines-layer")) {
        map.setLayoutProperty("heat-lines-layer", "visibility", heatVisibility);
      }
      if (map.getLayer("heat-lines-glow")) {
        map.setLayoutProperty("heat-lines-glow", "visibility", heatVisibility);
      }
      if (map.getLayer("shortest-route-lines-layer")) {
        map.setLayoutProperty(
          "shortest-route-lines-layer",
          "visibility",
          routeVisibility && showShortestOnMap ? "visible" : "none"
        );
      }
      if (map.getLayer("fastest-route-lines-layer")) {
        map.setLayoutProperty(
          "fastest-route-lines-layer",
          "visibility",
          routeVisibility && showFastestOnMap ? "visible" : "none"
        );
      }
      if (map.getLayer("route-points-layer")) {
        map.setLayoutProperty(
          "route-points-layer",
          "visibility",
          routeVisibility && (showShortestOnMap || showFastestOnMap)
            ? "visible"
            : "none"
        );
      }
    });
  }, [showHeatmapOnMap, showShortestOnMap, showFastestOnMap, mapInitTick]);

  useEffect(() => {
    const maps = [heatMapRef.current, routeMapRef.current].filter(
      (map): map is MapInstanceLike => map !== null
    );
    if (!maps.length || !bbox) return;
    maps.forEach((map) =>
      map.fitBounds(
      [
        [bbox.minLon, bbox.minLat],
        [bbox.maxLon, bbox.maxLat],
      ],
      { padding: 20, duration: 500 }
      )
    );
  }, [bbox, mapInitTick]);

  useEffect(() => {
    if (!isPlaying || buckets.length <= 1) return;
    const timer = window.setInterval(() => {
      setBucketIndex((prev) => (prev + 1) % buckets.length);
    }, 900);
    return () => window.clearInterval(timer);
  }, [isPlaying, buckets.length]);

  useEffect(() => {
    if (activeSection !== "bigscreen" || !bigScreenAutoPlay) return;
    const timer = window.setInterval(() => {
      setBigScreenSlide((prev) => (prev + 1) % 4);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeSection, bigScreenAutoPlay]);

  const kpis = useMemo(() => {
    if (!summary.length) {
      return {
        tripCount: 0,
        vehicleCount: 0,
        distanceKm: 0,
      };
    }
    return {
      tripCount: summary.reduce((acc, cur) => acc + cur.trip_count, 0),
      vehicleCount: Math.max(...summary.map((x) => x.vehicle_count)),
      distanceKm: summary.reduce((acc, cur) => acc + cur.distance_km, 0),
    };
  }, [summary]);

  const heatmapDateOptions = useMemo(() => {
    if (metaDates?.heatmap_dates?.length) {
      return metaDates.heatmap_dates;
    }
    return summary.map((item) => item.date);
  }, [metaDates, summary]);

  const fallbackAssetLayerSummary = useMemo(() => {
    const order = ["ODS", "DW", "TDM", "ADS"];
    return order.map((layer) => {
      const items = metaAssets.filter((item) => item.asset_layer === layer);
      const readyCount = items.filter((item) => item.status === "ready").length;
      return {
        asset_layer: layer,
        asset_count: items.length,
        ready_count: readyCount,
        total_rows: items.reduce((acc, item) => acc + item.row_count, 0),
        completion_rate: readyCount / Math.max(1, items.length),
        refreshed_at: null,
      };
    });
  }, [metaAssets]);

  const assetLayerSummary = useMemo(
    () =>
      metaPortalSummary?.items?.length
        ? metaPortalSummary.items
        : fallbackAssetLayerSummary,
    [fallbackAssetLayerSummary, metaPortalSummary]
  );

  const assetPortalTotals = useMemo(
    () => ({
      totalAssetCount:
        metaPortalSummary?.total_asset_count ??
        fallbackAssetLayerSummary.reduce((acc, item) => acc + item.asset_count, 0),
      totalReadyCount:
        metaPortalSummary?.total_ready_count ??
        fallbackAssetLayerSummary.reduce((acc, item) => acc + item.ready_count, 0),
      totalRows:
        metaPortalSummary?.total_rows ??
        fallbackAssetLayerSummary.reduce((acc, item) => acc + item.total_rows, 0),
    }),
    [fallbackAssetLayerSummary, metaPortalSummary]
  );

  const readyAssetCount = useMemo(
    () => assetPortalTotals.totalReadyCount,
    [assetPortalTotals]
  );

  const latestRefreshText = useMemo(() => {
    const value =
      metaPortalSummary?.refreshed_at ??
      metaDates?.refreshed_at ??
      latestJob?.finished_at ??
      null;
    if (!value) return "暂无";
    return value.replace("T", " ").slice(0, 16);
  }, [latestJob, metaDates, metaPortalSummary]);

  const latestJobText = useMemo(() => {
    if (!latestJob) return "暂无任务记录";
    const label =
      latestJob.status === "success"
        ? "成功"
        : latestJob.status === "failed"
          ? "失败"
          : latestJob.status === "running"
            ? "运行中"
            : latestJob.status;
    return `${label}${latestJob.message ? ` · ${latestJob.message}` : ""}`;
  }, [latestJob]);

  const selectedCrowdTagName = useMemo(() => {
    const tagCode = selectedCrowdTag || crowdSummary?.items?.[0]?.tag_code;
    if (!tagCode) return "暂无标签";
    const item = crowdSummary?.items.find((entry) => entry.tag_code === tagCode);
    return item?.tag_name ?? tagCode;
  }, [crowdSummary, selectedCrowdTag]);

  const crowdHeadline = useMemo(() => {
    if (!crowdSummary?.items?.length) return "暂无圈人标签结果";
    const top = crowdSummary.items[0];
    return `${top.tag_name} 当前覆盖 ${top.vehicle_count.toLocaleString()} 辆车`;
  }, [crowdSummary]);

  const routeStrategyHeadline = useMemo(() => {
    if (routeRecommendation?.summary) return routeRecommendation.summary;
    if (capability?.route_compare_ready) {
      return "路线策略引擎已就绪，可生成路径、时段和避堵建议。";
    }
    return "路线策略能力尚未完全就绪。";
  }, [capability, routeRecommendation]);

  const bigScreenSlides = useMemo(
    () => ["平台总览", "资产门户", "推荐策略", "圈人与热点"],
    []
  );

  const capabilityStates = useMemo(
    () => [
      { label: "图可用", ready: Boolean(capability?.graph_ready) },
      { label: "动态速度", ready: Boolean(capability?.dynamic_speed_ready) },
      { label: "路径对比", ready: Boolean(capability?.route_compare_ready) },
    ],
    [capability]
  );

  useEffect(() => {
    if (!selectedDate && heatmapDateOptions.length) {
      setSelectedDate(heatmapDateOptions[0]);
    }
  }, [heatmapDateOptions, selectedDate]);

  useEffect(() => {
    const fallbackRouteDate =
      metaDates?.default_route_date ??
      metaDates?.route_dates?.[0] ??
      heatmapDateOptions[0] ??
      "";
    if (!fallbackRouteDate) return;
    if (routePayload.start_time && routePayload.query_time) return;
    setRoutePayload((prev) => ({
      ...prev,
      start_time: prev.start_time || buildRouteDateTime(fallbackRouteDate),
      query_time: prev.query_time || buildRouteDateTime(fallbackRouteDate),
    }));
  }, [heatmapDateOptions, metaDates, routePayload.query_time, routePayload.start_time]);

  useEffect(() => {
    const resolvedTag = selectedCrowdTag || crowdSummary?.items?.[0]?.tag_code || "";
    if (!resolvedTag) {
      setCrowdVehicles([]);
      setCrowdSegments([]);
      return;
    }
    const run = async () => {
      try {
        const [vehicles, segments] = await Promise.all([
          fetchCrowdVehicles(resolvedTag),
          fetchCrowdSegments(resolvedTag),
        ]);
        setCrowdVehicles(vehicles);
        setCrowdSegments(segments);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载圈人结果失败");
      }
    };
    void run();
  }, [crowdSummary, selectedCrowdTag]);

  const onRunRoute = async () => {
    setError(null);
    try {
      if (!capability?.ready) {
        const issues =
          capability?.issues?.join("; ") || "路径能力未就绪";
        throw new Error(issues);
      }
      setRouteResult(await fetchRouteCompare(routePayload));
    } catch (e) {
      setError(e instanceof Error ? e.message : "路径对比接口调用失败");
    }
  };

  const onRunRecommendation = async () => {
    setError(null);
    setRecommendLoading(true);
    try {
      const [routeRec, departureRec, congestionRec] = await Promise.all([
        fetchRouteRecommendation(routePayload),
        fetchDepartureWindowRecommendation({
          travelDate: routePayload.query_time.slice(0, 10),
          startLat: routePayload.start_point.lat,
          startLon: routePayload.start_point.lon,
          endLat: routePayload.end_point.lat,
          endLon: routePayload.end_point.lon,
        }),
        fetchCongestionAvoidanceRecommendation({
          startTime: routePayload.start_time,
          queryTime: routePayload.query_time,
          startLat: routePayload.start_point.lat,
          startLon: routePayload.start_point.lon,
          endLat: routePayload.end_point.lat,
          endLon: routePayload.end_point.lon,
        }),
      ]);
      setRouteRecommendation(routeRec);
      setDepartureRecommendation(departureRec);
      setCongestionRecommendation(congestionRec);
    } catch (e) {
      setError(e instanceof Error ? e.message : "推荐服务调用失败");
    } finally {
      setRecommendLoading(false);
    }
  };

  const clearRouteOnMap = () => {
    setShowShortestOnMap(false);
    setShowFastestOnMap(false);
  };

  const clearRouteResult = () => {
    setRouteResult(null);
  };

  const clearHeatmapLayer = () => {
    setShowHeatmapOnMap(false);
    setHeatData([]);
  };

  const restoreHeatmapLayer = () => {
    setShowHeatmapOnMap(true);
  };

  const focusCrowdSegmentOnHeatmap = (segment: CrowdSegment) => {
    const nextBbox = parseGeometryBounds(segment.geometry);
    if (nextBbox) {
      setBbox(nextBbox);
    }
    if (!selectedDate && heatmapDateOptions.length) {
      setSelectedDate(heatmapDateOptions[0]);
    }
    setShowHeatmapOnMap(true);
    setActiveSection("heatmap");
  };

  const applyCrowdSegmentToRoute = (segment: CrowdSegment) => {
    const nextBbox = parseGeometryBounds(segment.geometry);
    if (!nextBbox) return;
    const centerLat = (nextBbox.minLat + nextBbox.maxLat) / 2;
    const centerLon = (nextBbox.minLon + nextBbox.maxLon) / 2;
    setRoutePayload((prev) => ({
      ...prev,
      end_point: {
        lat: Number(centerLat.toFixed(6)),
        lon: Number(centerLon.toFixed(6)),
      },
    }));
    setActiveSection("route");
  };

  const toggleBigScreenFocus = async () => {
    const root = workspaceRef.current;
    if (document.fullscreenElement) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else {
        setBigScreenFocus(false);
      }
      return;
    }
    if (root?.requestFullscreen) {
      try {
        await root.requestFullscreen();
        return;
      } catch {
        setBigScreenFocus((prev) => !prev);
        return;
      }
    }
    setBigScreenFocus((prev) => !prev);
  };

  const routeOverlap = useMemo(() => {
    const s = routeResult?.shortest_route?.path_wkt_segments ?? [];
    const f = routeResult?.fastest_route?.path_wkt_segments ?? [];
    if (!s.length || !f.length) return false;
    if (s.length !== f.length) return false;
    return s.every((seg, i) => seg === f[i]);
  }, [routeResult]);

  const routeErrorHint = useMemo(() => {
    if (!error) return null;
    if (error.toLowerCase().includes("no traversable path")) {
      return "当前点位在路网断连区域，建议在路径地图中使用“选择起点/选择终点”重新选点到附近道路节点。";
    }
    return null;
  }, [error]);

  const navGroups = useMemo(() => {
    return navItems.reduce<Record<string, typeof navItems>>((acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    }, {});
  }, []);

  return (
    <main
      ref={workspaceRef}
      className={`workspace ${bigScreenFocus ? "focus-mode" : ""}`}
    >
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">哈尔滨车辆行程分析平台</p>
          <h1>工作台</h1>
          <p className="sidebar-note">点击左侧模块，聚焦单一业务流程。</p>
        </div>

        <section className="status-panel">
          <div className="status-panel-head">
            <h3>数据状态</h3>
            <span
              className={`status-pill ${
                capability?.ready ? "ready" : "warning"
              }`}
            >
              {capability?.ready ? "路径可用" : "待初始化"}
            </span>
          </div>
          <div className="status-panel-grid">
            <div className="status-row">
              <span>最近刷新</span>
              <strong>{latestRefreshText}</strong>
            </div>
            <div className="status-row">
              <span>就绪资产</span>
              <strong>
                {readyAssetCount}/{assetPortalTotals.totalAssetCount || 0}
              </strong>
            </div>
            <div className="status-row full">
              <span>最近任务</span>
              <strong>{latestJobText}</strong>
            </div>
          </div>
          <div className="asset-status-list">
            {metaAssets.slice(0, 4).map((asset) => (
              <div key={asset.asset_key} className="asset-status-item">
                <div>
                  <span className="asset-name">{asset.display_name}</span>
                  <span className="asset-layer">{asset.asset_layer}</span>
                </div>
                <span
                  className={`status-pill ${
                    asset.status === "ready" ? "ready" : "warning"
                  }`}
                >
                  {assetStatusLabel(asset.status)}
                </span>
              </div>
            ))}
          </div>
        </section>

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
            <button
              type="button"
              className={`theme-btn ${theme === "light" ? "active" : ""}`}
              onClick={() => setTheme("light")}
            >
              浅色
            </button>
            <button
              type="button"
              className={`theme-btn ${theme === "dark" ? "active" : ""}`}
              onClick={() => setTheme("dark")}
            >
              深色
            </button>
          </div>
        </div>
      </aside>

      <section className="content">
        <header className="content-header">
          <h2>{navItems.find((item) => item.id === activeSection)?.title}</h2>
          <p>
            基于 H5 + JLD2 合并入仓，依托 PostGIS 统计能力，支持最短路与最快路的路径对比。
          </p>
          <div className="content-meta">
            <span>热力图日期数：{heatmapDateOptions.length}</span>
            <span>最近刷新：{latestRefreshText}</span>
          </div>
        </header>

        {error ? <section className="error">{error}</section> : null}
        {routeErrorHint ? <section className="loading">{routeErrorHint}</section> : null}
        {loading ? <section className="loading">正在加载后端数据...</section> : null}

        <div key={activeSection} className="panel-fade">
        {activeSection === "assets" ? (
          <section className="asset-portal">
            <section className="kpi-grid asset-layer-grid">
              <article className="card">
                <h3>总资产数</h3>
                <p>{assetPortalTotals.totalAssetCount.toLocaleString()}</p>
                <div className="mini-metrics">
                  <span>四层已登记</span>
                  <span>门户读模型驱动</span>
                </div>
              </article>
              <article className="card">
                <h3>就绪资产</h3>
                <p>{assetPortalTotals.totalReadyCount.toLocaleString()}</p>
                <div className="mini-metrics">
                  <span>最近刷新 {latestRefreshText}</span>
                  <span>任务 {latestJob?.status ?? "unknown"}</span>
                </div>
              </article>
              <article className="card">
                <h3>总行数</h3>
                <p>{assetPortalTotals.totalRows.toLocaleString()}</p>
                <div className="mini-metrics">
                  <span>覆盖 ODS / DW / TDM / ADS</span>
                  <span>支持门户与推荐服务</span>
                </div>
              </article>
            </section>

            <section className="kpi-grid asset-layer-grid">
              {assetLayerSummary.map((item) => (
                <article key={item.asset_layer} className="card">
                  <h3>{item.asset_layer} 资产</h3>
                  <p>{item.asset_count.toLocaleString()}</p>
                  <div className="mini-metrics">
                    <span>就绪 {item.ready_count}</span>
                    <span>总行数 {item.total_rows.toLocaleString()}</span>
                    <span>完成率 {(item.completion_rate * 100).toFixed(0)}%</span>
                  </div>
                </article>
              ))}
            </section>

            <section className="panel asset-catalog-panel">
              <h4>资产目录</h4>
              <div className="asset-catalog-list">
                {metaAssets.map((asset) => (
                  <div key={asset.asset_key} className="asset-catalog-item">
                    <div>
                      <strong>{asset.display_name}</strong>
                      <p>{asset.description ?? asset.source_table}</p>
                    </div>
                    <div className="asset-catalog-meta">
                      <span>{asset.asset_layer}</span>
                      <span>{asset.source_table}</span>
                      <span>{asset.row_count.toLocaleString()} rows</span>
                      <span
                        className={`status-pill ${
                          asset.status === "ready" ? "ready" : "warning"
                        }`}
                      >
                        {assetStatusLabel(asset.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </section>
        ) : null}

        {activeSection === "overview" ? (
          <>
            <section className="kpi-grid">
              <article className="card">
                <h3>总行程数</h3>
                <p>{kpis.tripCount.toLocaleString()}</p>
              </article>
              <article className="card">
                <h3>单日峰值车辆数</h3>
                <p>{kpis.vehicleCount.toLocaleString()}</p>
              </article>
              <article className="card">
                <h3>总里程（km）</h3>
                <p>{kpis.distanceKm.toFixed(2)}</p>
              </article>
            </section>

            <section className="panel-grid">
              <article className="panel">
                <h4>每日行程数</h4>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={tripSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="date" stroke="var(--chart-axis)" />
                    <YAxis stroke="var(--chart-axis)" />
                    <Tooltip
                      formatter={(value) => [`${tooltipValue(value)}`, "行程数"]}
                      {...tooltipTheme}
                    />
                    <Bar dataKey="value" fill="var(--chart-cyan)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </article>
              <article className="panel">
                <h4>每日车辆数</h4>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={vehicleSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="date" stroke="var(--chart-axis)" />
                    <YAxis stroke="var(--chart-axis)" />
                    <Tooltip
                      formatter={(value) => [`${tooltipValue(value)}`, "车辆数"]}
                      {...tooltipTheme}
                    />
                    <Bar
                      dataKey="value"
                      fill="var(--chart-amber)"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </article>
              <article className="panel panel-wide">
                <h4>每日里程</h4>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={distanceSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="date" stroke="var(--chart-axis)" />
                    <YAxis stroke="var(--chart-axis)" />
                    <Tooltip
                      formatter={(value) => [`${tooltipValue(value).toFixed(2)} km`, "里程"]}
                      {...tooltipTheme}
                    />
                    <Line
                      dataKey="value"
                      stroke="var(--chart-cyan)"
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </article>
            </section>

            <section className="panel-grid single-mode">
              <article className="panel">
                <h4>里程箱线图</h4>
                <BoxplotMini data={distanceBox} unit="m" />
              </article>
              <article className="panel">
                <h4>速度箱线图</h4>
                <BoxplotMini data={speedBox} unit="km/h" />
              </article>
            </section>
          </>
        ) : null}

        {activeSection === "heatmap" ? (
          <section className="panel">
            <h4>热力图回放</h4>
            <div className="playback-controls">
              <label>
                日期
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  disabled={!heatmapDateOptions.length}
                >
                  {!heatmapDateOptions.length ? (
                    <option value="">暂无可用日期</option>
                  ) : null}
                  {heatmapDateOptions.map((d) => (
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
              <button type="button" onClick={() => setIsPlaying((v) => !v)}>
                {isPlaying ? "暂停" : "播放"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setBbox({ minLat: 45.7, minLon: 126.55, maxLat: 45.82, maxLon: 126.75 })
                }
              >
                缩放到框选范围
              </button>
              <button type="button" onClick={() => setBbox(null)}>
                重置范围
              </button>
            </div>

            <div className="heatmap-toolbar">
              <div className="heat-legend" aria-label="热力图流量图例">
                <span className="legend-chip smooth">畅通</span>
                <span className="legend-chip busy">繁忙</span>
                <span className="legend-chip congested">拥堵</span>
              </div>
              {showHeatmapOnMap ? (
                <button type="button" className="secondary-btn" onClick={clearHeatmapLayer}>
                  清空热力图
                </button>
              ) : (
                <button type="button" className="secondary-btn" onClick={restoreHeatmapLayer}>
                  恢复热力图
                </button>
              )}
            </div>

            <div className="map-wrap">
              <div className="map-head">道路流量热力图（MapLibre GL）</div>
              <div ref={heatMapContainerRef} className="map-canvas" />
            </div>
            <p className="bucket-tip">当前时间桶：{buckets[bucketIndex] ?? "暂无"}</p>
          </section>
        ) : null}

        {activeSection === "route" ? (
          <section className="route-panel">
            <h4>路径对比</h4>
            <p className="capability-line">
              路径能力：{capability?.ready ? "已就绪" : "未就绪"}
              {capability?.edge_count !== undefined
                  ? ` | 边数量：${capability.edge_count.toLocaleString()}`
                : ""}
              {capability?.speed_bins_count !== undefined
                  ? ` | 速度桶：${capability.speed_bins_count.toLocaleString()}`
                : ""}
            </p>
            {capabilityError ? (
              <div className="route-capability-issues">
                能力检查失败：{capabilityError}
              </div>
            ) : null}
            {!capability?.ready && capability?.issues?.length ? (
              <div className="route-capability-issues">{capability.issues.join("; ")}</div>
            ) : null}

            <div className="inputs">
              <label>
                起始时间
                <input
                  type="datetime-local"
                  value={routePayload.start_time ? routePayload.start_time.slice(0, 16) : ""}
                  onChange={(e) =>
                    setRoutePayload((prev) => ({
                      ...prev,
                      start_time: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                查询时间
                <input
                  type="datetime-local"
                  value={routePayload.query_time ? routePayload.query_time.slice(0, 16) : ""}
                  onChange={(e) =>
                    setRoutePayload((prev) => ({
                      ...prev,
                      query_time: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                起点纬度
                <input
                  type="number"
                  value={routePayload.start_point.lat}
                  onChange={(e) =>
                    setRoutePayload((prev) => ({
                      ...prev,
                      start_point: { ...prev.start_point, lat: Number(e.target.value) },
                    }))
                  }
                />
              </label>
              <label>
                起点经度
                <input
                  type="number"
                  value={routePayload.start_point.lon}
                  onChange={(e) =>
                    setRoutePayload((prev) => ({
                      ...prev,
                      start_point: { ...prev.start_point, lon: Number(e.target.value) },
                    }))
                  }
                />
              </label>
              <label>
                终点纬度
                <input
                  type="number"
                  value={routePayload.end_point.lat}
                  onChange={(e) =>
                    setRoutePayload((prev) => ({
                      ...prev,
                      end_point: { ...prev.end_point, lat: Number(e.target.value) },
                    }))
                  }
                />
              </label>
              <label>
                终点经度
                <input
                  type="number"
                  value={routePayload.end_point.lon}
                  onChange={(e) =>
                    setRoutePayload((prev) => ({
                      ...prev,
                      end_point: { ...prev.end_point, lon: Number(e.target.value) },
                    }))
                  }
                />
              </label>
            </div>

            <p className="route-time-tip">
              `起始时间` 表示请求上下文时间；`查询时间` 用于命中 5 分钟速度桶。
              当查询时间变化时，最快路径可能变化。
            </p>
            {routeResult?.snapped_start_point && routeResult?.snapped_end_point ? (
              <p className="route-time-tip">
                起点吸附：节点 {routeResult.snapped_start_point.node_id}，坐标 (
                {routeResult.snapped_start_point.lat.toFixed(6)},{" "}
                {routeResult.snapped_start_point.lon.toFixed(6)}) | dist{" "}
                {routeResult.snapped_start_point.snap_distance_m.toFixed(1)} m；终点吸附：节点
                {routeResult.snapped_end_point.node_id}，坐标 (
                {routeResult.snapped_end_point.lat.toFixed(6)},{" "}
                {routeResult.snapped_end_point.lon.toFixed(6)}) | dist{" "}
                {routeResult.snapped_end_point.snap_distance_m.toFixed(1)} m。
              </p>
            ) : null}
            <button
              onClick={onRunRoute}
              disabled={
                !capability?.ready ||
                !routePayload.start_time ||
                !routePayload.query_time
              }
            >
              执行路径对比
            </button>

            <div className="route-map-controls">
              <span className="legend-title">地图路径图层</span>
              <label className="legend-item shortest">
                <input
                  type="checkbox"
                  checked={showShortestOnMap}
                  onChange={(e) => setShowShortestOnMap(e.target.checked)}
                />
                最短路径（青色虚线）
              </label>
              <label className="legend-item fastest">
                <input
                  type="checkbox"
                  checked={showFastestOnMap}
                  onChange={(e) => setShowFastestOnMap(e.target.checked)}
                />
                最快路径（橙色实线）
              </label>
              <button type="button" className="secondary-btn" onClick={clearRouteOnMap}>
                清空路径图层
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={clearRouteResult}
              >
                清空路径结果
              </button>
            </div>

            <div className="route-pick-controls">
              <span className="legend-title">地图选点</span>
              <button
                type="button"
                className={`secondary-btn ${routePickMode === "start" ? "active-mode" : ""}`}
                onClick={() =>
                  setRoutePickMode((prev) => (prev === "start" ? "none" : "start"))
                }
              >
                选择起点
              </button>
              <button
                type="button"
                className={`secondary-btn ${routePickMode === "end" ? "active-mode" : ""}`}
                onClick={() =>
                  setRoutePickMode((prev) => (prev === "end" ? "none" : "end"))
                }
              >
                选择终点
              </button>
              <span className="pick-tip">
                {routePickMode === "none"
                  ? "请先选择模式，再点击地图自动回填坐标"
                  : routePickMode === "start"
                    ? "正在选择起点：请点击地图"
                    : "正在选择终点：请点击地图"}
              </span>
            </div>

            <div className="map-wrap">
              <div className="map-head">路径对比地图（MapLibre GL）</div>
              <div ref={routeMapContainerRef} className="map-canvas" />
            </div>

            {routeOverlap ? (
              <p className="route-overlap-tip">
                当前查询时间下，最短路径与最快路径一致。
              </p>
            ) : null}

            {routeResult ? (
              <div className="route-result-grid">
                <article className="route-card">
                  <h5>最短路径</h5>
                  <p>
                    总里程：{(routeResult.shortest_route?.distance_m ?? 0).toFixed(2)} m
                  </p>
                  <p>
                    总耗时：{(routeResult.shortest_route?.estimated_time_s ?? 0).toFixed(2)} s
                  </p>
                  <div className="route-edges">
                    {((routeResult.shortest_route?.edges ?? [])).map((edge) => (
                      <div
                        key={`short-${edge.seq}-${edge.edge_id}`}
                        className="route-edge-row"
                        title={`道路=${edge.road_id ?? "未知"}, 分段里程=${edge.distance_m.toFixed(2)}m, 分段耗时=${edge.estimated_time_s.toFixed(2)}s, 累计里程=${edge.cumulative_distance_m.toFixed(2)}m, 累计耗时=${edge.cumulative_time_s.toFixed(2)}s`}
                      >
                        <span>#{edge.seq}</span>
                        <span>边 {edge.edge_id}</span>
                        <span>道路 {edge.road_id ?? "-"}</span>
                        <span>{safeNum(edge.distance_m).toFixed(1)} m</span>
                        <span>{safeNum(edge.estimated_time_s).toFixed(1)} s</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="route-card">
                  <h5>最快路径</h5>
                  <p>
                    总里程：{(routeResult.fastest_route?.distance_m ?? 0).toFixed(2)} m
                  </p>
                  <p>
                    总耗时：{(routeResult.fastest_route?.estimated_time_s ?? 0).toFixed(2)} s
                  </p>
                  <div className="route-edges">
                    {((routeResult.fastest_route?.edges ?? [])).map((edge) => (
                      <div
                        key={`fast-${edge.seq}-${edge.edge_id}`}
                        className="route-edge-row"
                        title={`道路=${edge.road_id ?? "未知"}, 分段里程=${edge.distance_m.toFixed(2)}m, 分段耗时=${edge.estimated_time_s.toFixed(2)}s, 累计里程=${edge.cumulative_distance_m.toFixed(2)}m, 累计耗时=${edge.cumulative_time_s.toFixed(2)}s`}
                      >
                        <span>#{edge.seq}</span>
                        <span>边 {edge.edge_id}</span>
                        <span>道路 {edge.road_id ?? "-"}</span>
                        <span>{safeNum(edge.distance_m).toFixed(1)} m</span>
                        <span>{safeNum(edge.estimated_time_s).toFixed(1)} s</span>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeSection === "recommend" ? (
          <section className="recommend-panel">
            <h4>推荐中心</h4>
            <p className="capability-line">
              输出三类建议：路径推荐、出发时段推荐、拥堵规避建议。
            </p>

            <div className="inputs">
              <label>
                起始时间
                <input
                  type="datetime-local"
                  value={routePayload.start_time ? routePayload.start_time.slice(0, 16) : ""}
                  onChange={(e) =>
                    setRoutePayload((prev) => ({
                      ...prev,
                      start_time: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                查询时间
                <input
                  type="datetime-local"
                  value={routePayload.query_time ? routePayload.query_time.slice(0, 16) : ""}
                  onChange={(e) =>
                    setRoutePayload((prev) => ({
                      ...prev,
                      query_time: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                起点纬度
                <input
                  type="number"
                  value={routePayload.start_point.lat}
                  onChange={(e) =>
                    setRoutePayload((prev) => ({
                      ...prev,
                      start_point: { ...prev.start_point, lat: Number(e.target.value) },
                    }))
                  }
                />
              </label>
              <label>
                起点经度
                <input
                  type="number"
                  value={routePayload.start_point.lon}
                  onChange={(e) =>
                    setRoutePayload((prev) => ({
                      ...prev,
                      start_point: { ...prev.start_point, lon: Number(e.target.value) },
                    }))
                  }
                />
              </label>
              <label>
                终点纬度
                <input
                  type="number"
                  value={routePayload.end_point.lat}
                  onChange={(e) =>
                    setRoutePayload((prev) => ({
                      ...prev,
                      end_point: { ...prev.end_point, lat: Number(e.target.value) },
                    }))
                  }
                />
              </label>
              <label>
                终点经度
                <input
                  type="number"
                  value={routePayload.end_point.lon}
                  onChange={(e) =>
                    setRoutePayload((prev) => ({
                      ...prev,
                      end_point: { ...prev.end_point, lon: Number(e.target.value) },
                    }))
                  }
                />
              </label>
            </div>

            <button
              type="button"
              onClick={onRunRecommendation}
              disabled={
                recommendLoading ||
                !capability?.ready ||
                !routePayload.start_time ||
                !routePayload.query_time
              }
            >
              {recommendLoading ? "生成推荐中..." : "生成推荐方案"}
            </button>

            <section className="panel-grid recommend-grid">
              <article className="panel">
                <div className="recommend-head">
                  <h4>路径推荐</h4>
                  <span>{routeRecommendation?.recommended_strategy ?? "未生成"}</span>
                </div>
                {routeRecommendation ? (
                  <>
                    <p className="recommend-summary">{routeRecommendation.summary}</p>
                    <div className="recommend-stat-row">
                      <span>动态速度：{routeRecommendation.used_dynamic_speed ? "是" : "否"}</span>
                      <span>时间收益：{routeRecommendation.time_saved_s.toFixed(1)} s</span>
                      <span>里程差：{routeRecommendation.distance_delta_m.toFixed(1)} m</span>
                    </div>
                    <div className="recommend-reasons">
                      {routeRecommendation.reasons.map((reason) => (
                        <div key={reason} className="recommend-reason-item">
                          {reason}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="empty">暂无路径推荐结果</div>
                )}
              </article>

              <article className="panel">
                <div className="recommend-head">
                  <h4>出发时段推荐</h4>
                  <span>
                    {departureRecommendation?.recommended_start_time?.slice(11, 16) ??
                      "未生成"}
                  </span>
                </div>
                {departureRecommendation ? (
                  <>
                    <p className="recommend-summary">{departureRecommendation.summary}</p>
                    <div className="recommend-reasons">
                      {departureRecommendation.options.map((option) => (
                        <div
                          key={`${option.start_time}-${option.recommended_strategy}`}
                          className="recommend-reason-item"
                        >
                          {option.start_time.slice(11, 16)} · {option.recommended_strategy} ·{" "}
                          {option.estimated_time_s.toFixed(1)} s
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="empty">暂无时段推荐结果</div>
                )}
              </article>

              <article className="panel panel-wide">
                <div className="recommend-head">
                  <h4>拥堵规避建议</h4>
                  <span>{congestionRecommendation?.recommended_action ?? "未生成"}</span>
                </div>
                {congestionRecommendation ? (
                  <>
                    <p className="recommend-summary">{congestionRecommendation.summary}</p>
                    <div className="recommend-stat-row">
                      <span>
                        当前网络：{congestionRecommendation.current_network_level ?? "unknown"}
                      </span>
                      <span>
                        建议时段：{congestionRecommendation.recommended_query_time.slice(11, 16)}
                      </span>
                      <span>建议策略：{congestionRecommendation.recommended_strategy}</span>
                    </div>
                    <div className="recommend-reasons">
                      {congestionRecommendation.reasons.map((reason) => (
                        <div key={reason} className="recommend-reason-item">
                          {reason}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="empty">暂无拥堵规避建议</div>
                )}
              </article>
            </section>
          </section>
        ) : null}

        {activeSection === "bigscreen" ? (
          <section className={`bigscreen-panel ${bigScreenFocus ? "focus" : ""}`}>
            <div className="bigscreen-banner">
              <div>
                <p className="eyebrow">答辩模式</p>
                <h3>数据资产门户大屏</h3>
                <p>
                  面向课堂展示聚合门户、分析、推荐、圈人四类能力，并支持自动轮播。
                </p>
              </div>
              <div className="bigscreen-controls">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setBigScreenAutoPlay((prev) => !prev)}
                >
                  {bigScreenAutoPlay ? "暂停轮播" : "自动轮播"}
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void toggleBigScreenFocus()}
                >
                  {bigScreenFocus ? "退出全屏" : "进入全屏"}
                </button>
              </div>
            </div>

            <div className="bigscreen-indicators">
              {bigScreenSlides.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={`bigscreen-indicator ${
                    bigScreenSlide === index ? "active" : ""
                  }`}
                  onClick={() => setBigScreenSlide(index)}
                >
                  {index + 1}. {label}
                </button>
              ))}
            </div>

            <section className="bigscreen-stage">
              {bigScreenSlide === 0 ? (
                <>
                  <section className="kpi-grid">
                    <article className="card">
                      <h3>总行程数</h3>
                      <p>{kpis.tripCount.toLocaleString()}</p>
                    </article>
                    <article className="card">
                      <h3>单日峰值车辆数</h3>
                      <p>{kpis.vehicleCount.toLocaleString()}</p>
                    </article>
                    <article className="card">
                      <h3>总里程（km）</h3>
                      <p>{kpis.distanceKm.toFixed(2)}</p>
                    </article>
                    <article className="card">
                      <h3>热力日期数</h3>
                      <p>{heatmapDateOptions.length.toLocaleString()}</p>
                    </article>
                  </section>
                  <section className="panel-grid">
                    <article className="panel panel-wide">
                      <h4>平台状态</h4>
                      <p className="recommend-summary">{routeStrategyHeadline}</p>
                      <div className="recommend-stat-row">
                        <span>最近刷新：{latestRefreshText}</span>
                        <span>最近任务：{latestJob?.status ?? "unknown"}</span>
                        <span>就绪资产：{assetPortalTotals.totalReadyCount}</span>
                      </div>
                    </article>
                  </section>
                </>
              ) : null}

              {bigScreenSlide === 1 ? (
                <>
                  <section className="kpi-grid asset-layer-grid">
                    {assetLayerSummary.map((item) => (
                      <article key={item.asset_layer} className="card">
                        <h3>{item.asset_layer}</h3>
                        <p>{item.asset_count.toLocaleString()}</p>
                        <div className="mini-metrics">
                          <span>就绪 {item.ready_count}</span>
                          <span>总行数 {item.total_rows.toLocaleString()}</span>
                          <span>完成率 {(item.completion_rate * 100).toFixed(0)}%</span>
                        </div>
                      </article>
                    ))}
                  </section>
                  <section className="panel-grid">
                    <article className="panel">
                      <h4>任务与状态</h4>
                      <p className="recommend-summary">{latestJobText}</p>
                      <div className="recommend-reasons">
                        {capabilityStates.map((item) => (
                          <div key={item.label} className="recommend-reason-item">
                            {item.label}：{item.ready ? "已就绪" : "未就绪"}
                          </div>
                        ))}
                      </div>
                    </article>
                    <article className="panel">
                      <h4>资产目录覆盖</h4>
                      <div className="recommend-reasons">
                        {metaAssets.slice(0, 6).map((asset) => (
                          <div key={asset.asset_key} className="recommend-reason-item">
                            {asset.display_name} · {asset.asset_layer} · {asset.status}
                          </div>
                        ))}
                      </div>
                    </article>
                  </section>
                </>
              ) : null}

              {bigScreenSlide === 2 ? (
                <section className="panel-grid recommend-grid">
                  <article className="panel">
                    <div className="recommend-head">
                      <h4>路径推荐</h4>
                      <span>{routeRecommendation?.recommended_strategy ?? "待生成"}</span>
                    </div>
                    <p className="recommend-summary">
                      {routeRecommendation?.summary ?? "先在推荐中心运行一次推荐，即可同步展示在大屏中。"}
                    </p>
                    <div className="recommend-stat-row">
                      <span>当前时段：{routePayload.query_time?.slice(11, 16) || "--:--"}</span>
                      <span>
                        推荐时段：
                        {departureRecommendation?.recommended_start_time?.slice(11, 16) ||
                          "--:--"}
                      </span>
                      <span>
                        避堵动作：
                        {congestionRecommendation?.recommended_action ?? "待生成"}
                      </span>
                    </div>
                  </article>
                  <article className="panel panel-wide">
                    <h4>推荐解释</h4>
                    <div className="recommend-reasons">
                      {(routeRecommendation?.reasons ??
                        congestionRecommendation?.reasons ??
                        ["推荐中心支持路径、时段和拥堵规避的可解释输出。"]).map(
                        (reason) => (
                          <div key={reason} className="recommend-reason-item">
                            {reason}
                          </div>
                        )
                      )}
                    </div>
                  </article>
                </section>
              ) : null}

              {bigScreenSlide === 3 ? (
                <section className="panel-grid crowd-grid">
                  <article className="panel">
                    <h4>圈人概览</h4>
                    <p className="recommend-summary">{crowdHeadline}</p>
                    <div className="recommend-stat-row">
                      <span>画像车辆：{crowdSummary?.total_vehicle_count ?? 0}</span>
                      <span>已打标签：{crowdSummary?.tagged_vehicle_count ?? 0}</span>
                      <span>标签种类：{crowdSummary?.tag_count ?? 0}</span>
                    </div>
                    <div className="recommend-reasons">
                      {(crowdSummary?.items ?? []).slice(0, 4).map((item) => (
                        <div key={item.tag_code} className="recommend-reason-item">
                          {item.tag_name} · {item.vehicle_count} 辆车
                        </div>
                      ))}
                    </div>
                  </article>
                  <article className="panel">
                    <h4>热点道路</h4>
                    <div className="recommend-reasons">
                      {crowdSegments.slice(0, 5).map((segment) => (
                        <div
                          key={`${segment.tag_code}-${segment.road_id ?? "unknown"}-stage`}
                          className="recommend-reason-item"
                        >
                          {(segment.road_name ?? segment.road_id ?? "未知道路")} ·{" "}
                          {segment.trip_count} 次经过
                        </div>
                      ))}
                    </div>
                  </article>
                </section>
              ) : null}
            </section>
          </section>
        ) : null}

        {activeSection === "crowd" ? (
          <section className="crowd-panel">
            <h4>圈人中心</h4>
            <p className="capability-line">
              基于 TDM 车辆画像与标签层，支持按标签筛选车辆样本和道路热点。
            </p>

            <section className="kpi-grid crowd-kpi-grid">
              <article className="card">
                <h3>车辆画像数</h3>
                <p>{(crowdSummary?.total_vehicle_count ?? 0).toLocaleString()}</p>
              </article>
              <article className="card">
                <h3>已打标签车辆</h3>
                <p>{(crowdSummary?.tagged_vehicle_count ?? 0).toLocaleString()}</p>
              </article>
              <article className="card">
                <h3>标签种类</h3>
                <p>{(crowdSummary?.tag_count ?? 0).toLocaleString()}</p>
              </article>
            </section>

            <div className="crowd-tag-strip">
              {(crowdSummary?.items ?? []).map((item) => (
                <button
                  key={item.tag_code}
                  type="button"
                  className={`crowd-tag-chip ${
                    (selectedCrowdTag || crowdSummary?.items?.[0]?.tag_code) === item.tag_code
                      ? "active"
                      : ""
                  }`}
                  onClick={() => setSelectedCrowdTag(item.tag_code)}
                >
                  <span>{item.tag_name}</span>
                  <strong>{item.vehicle_count}</strong>
                </button>
              ))}
            </div>

            <section className="panel-grid crowd-grid">
              <article className="panel">
                <div className="crowd-panel-head">
                  <h4>车辆样本</h4>
                  <span>{selectedCrowdTagName}</span>
                </div>
                {!crowdVehicles.length ? (
                  <div className="empty">暂无车辆标签结果</div>
                ) : (
                  <div className="crowd-list">
                    {crowdVehicles.map((vehicle) => (
                      <div key={vehicle.vehicle_id} className="crowd-list-item">
                        <div>
                          <strong>{vehicle.vehicle_id}</strong>
                          <p>{vehicle.tags.join(" / ")}</p>
                        </div>
                        <div className="crowd-item-metrics">
                          <span>{vehicle.trip_count} 次行程</span>
                          <span>{vehicle.active_days} 天活跃</span>
                          <span>{vehicle.total_distance_m.toFixed(0)} m</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="panel">
                <div className="crowd-panel-head">
                  <h4>道路热点</h4>
                  <span>{selectedCrowdTagName}</span>
                </div>
                {!crowdSegments.length ? (
                  <div className="empty">暂无道路热点结果</div>
                ) : (
                  <div className="crowd-list">
                    {crowdSegments.map((segment) => (
                      <div
                        key={`${segment.tag_code}-${segment.road_id ?? "unknown"}`}
                        className="crowd-list-item"
                      >
                        <div>
                          <strong>{segment.road_name ?? segment.road_id ?? "未知道路"}</strong>
                          <p>{segment.road_id ?? "-"}</p>
                        </div>
                        <div className="crowd-item-metrics">
                          <span>{segment.trip_count} 次经过</span>
                          <span>{segment.vehicle_count} 辆车</span>
                          <span>{segment.distance_m.toFixed(0)} m</span>
                        </div>
                        <div className="crowd-actions">
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => focusCrowdSegmentOnHeatmap(segment)}
                            disabled={!segment.geometry}
                          >
                            定位到热力图
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => applyCrowdSegmentToRoute(segment)}
                            disabled={!segment.geometry}
                          >
                            设为路线终点
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>
          </section>
        ) : null}
        </div>
      </section>
    </main>
  );
}

export default App;
