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
  type BoxRow,
  type DailyPoint,
  type HeatItem,
  type RouteCapability,
  type RoutePayload,
  type RouteResult,
  type SummaryRow,
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
type AppSection = "overview" | "heatmap" | "route";
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
  start_time: "2015-01-03T08:00:00",
  query_time: "2015-01-03T08:00:00",
  start_point: { lat: 45.756, lon: 126.642 },
  end_point: { lat: 45.721, lon: 126.588 },
};

const navItems: Array<{
  id: AppSection;
  title: string;
  desc: string;
  icon: string;
  group: string;
}> = [
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
];

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
  const [bbox, setBbox] = useState<{
    minLat: number;
    minLon: number;
    maxLat: number;
    maxLon: number;
  } | null>(null);
  const [capability, setCapability] = useState<RouteCapability | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [showShortestOnMap, setShowShortestOnMap] = useState(true);
  const [showFastestOnMap, setShowFastestOnMap] = useState(true);
  const [showHeatmapOnMap, setShowHeatmapOnMap] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [activeSection, setActiveSection] = useState<AppSection>("overview");
  const [routePickMode, setRoutePickMode] = useState<RoutePickMode>("none");
  const [mapInitTick, setMapInitTick] = useState(0);

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
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
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
      try {
        const items = await fetchHeatmapBuckets(selectedDate);
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
        </header>

        {error ? <section className="error">{error}</section> : null}
        {routeErrorHint ? <section className="loading">{routeErrorHint}</section> : null}
        {loading ? <section className="loading">正在加载后端数据...</section> : null}

        <div key={activeSection} className="panel-fade">
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
                >
                  {["2015-01-03", "2015-01-04", "2015-01-05", "2015-01-06", "2015-01-07"].map(
                    (d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    )
                  )}
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
                  value={routePayload.start_time.slice(0, 16)}
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
                  value={routePayload.query_time.slice(0, 16)}
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
            <button onClick={onRunRoute} disabled={!capability?.ready}>
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
        </div>
      </section>
    </main>
  );
}

export default App;
