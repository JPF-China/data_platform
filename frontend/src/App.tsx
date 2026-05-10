import { useEffect, useMemo, useRef, useState } from "react";
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
import "./App.css";
import {
  fetchCongestionAvoidanceRecommendation,
  fetchCrowdProfileSummary,
  fetchCrowdSegmentGeometry,
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
import { MapDisplay } from "./features/map/MapDisplay";

type MapBBox = {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
};
type ThemeMode = "dark" | "light";
type AppSection =
  | "status"
  | "assets"
  | "overview"
  | "heatmap"
  | "route"
  | "recommend"
  | "crowd";
type RoutePickMode = "none" | "start" | "end";
type CrowdRoadMapModal = {
  segment: CrowdSegment;
  bbox: MapBBox;
  heatData: HeatItem[];
  metricDate?: string;
  bucketStart?: string;
  loading: boolean;
};

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

const ASSET_LAYER_ORDER = ["ODS", "DW", "TDM", "ADS"];

const ASSET_LAYER_NAMES: Record<string, string> = {
  ODS: "原始接入层",
  DW: "明细加工层",
  TDM: "主题数据层",
  ADS: "应用服务层",
};

const assetLayerClass = (layer: string): string =>
  `asset-layer-${layer.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

const buildRouteDateTime = (dateText: string): string => `${dateText}T08:00:00`;

const navItems: Array<{
  id: AppSection;
  title: string;
  desc: string;
  icon: string;
  group: string;
}> = [
  {
    id: "status",
    title: "数据状态",
    desc: "刷新、任务与能力检查",
    icon: "ST",
    group: "门户",
  },
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
  const [heatmapBucketsLoading, setHeatmapBucketsLoading] = useState(false);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
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
  const [crowdVehiclesLoading, setCrowdVehiclesLoading] = useState(false);
  const [crowdSegmentsLoading, setCrowdSegmentsLoading] = useState(false);
  const [crowdGeometryLoadingRoadId, setCrowdGeometryLoadingRoadId] =
    useState<string | null>(null);
  const [crowdRoadMapModal, setCrowdRoadMapModal] =
    useState<CrowdRoadMapModal | null>(null);
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
  const [activeSection, setActiveSection] = useState<AppSection>("status");
  const [routePickMode, setRoutePickMode] = useState<RoutePickMode>("none");
  const [globalSearch, setGlobalSearch] = useState("");

  const crowdVehiclesCacheRef = useRef<Map<string, CrowdVehicle[]>>(new Map());
  const crowdSegmentsCacheRef = useRef<Map<string, CrowdSegment[]>>(new Map());
  const crowdSegmentGeometryCacheRef = useRef<Map<string, string | null>>(new Map());

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
    let cancelled = false;
    const run = async () => {
      if (!selectedDate) {
        setBuckets([]);
        setBucketIndex(0);
        setHeatmapBucketsLoading(false);
        return;
      }
      setHeatmapBucketsLoading(true);
      setIsPlaying(false);
      try {
        const items = await fetchMetaHeatmapBuckets(selectedDate);
        if (!cancelled) {
          setBuckets(items);
          setBucketIndex(0);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载热力时间桶失败");
        }
      } finally {
        if (!cancelled) {
          setHeatmapBucketsLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  useEffect(() => {
    const bucket = buckets[bucketIndex];
    if (!bucket) {
      setHeatData([]);
      setHeatmapLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setHeatmapLoading(true);
      try {
        const items = await fetchHeatmap({
          metricDate: selectedDate,
          bucketStart: bucket,
          minLat: bbox?.minLat,
          minLon: bbox?.minLon,
          maxLat: bbox?.maxLat,
          maxLon: bbox?.maxLon,
        });
        if (!cancelled) {
          setHeatData(items);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载热力图数据失败");
        }
      } finally {
        if (!cancelled) {
          setHeatmapLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, bucketIndex, buckets, bbox]);

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

  const assetsByLayer = useMemo(() => {
    const grouped = metaAssets.reduce((acc, asset) => {
      const layer = asset.asset_layer || "UNKNOWN";
      if (!acc.has(layer)) acc.set(layer, []);
      acc.get(layer)?.push(asset);
      return acc;
    }, new Map<string, MetaAsset[]>());

    const orderedLayers = [
      ...ASSET_LAYER_ORDER.filter((layer) => grouped.has(layer)),
      ...Array.from(grouped.keys())
        .filter((layer) => !ASSET_LAYER_ORDER.includes(layer))
        .sort(),
    ];

    return orderedLayers.map((layer) => {
      const assets = grouped.get(layer) ?? [];
      const summary = assetLayerSummary.find((item) => item.asset_layer === layer);
      const readyCount =
        summary?.ready_count ?? assets.filter((asset) => asset.status === "ready").length;
      const totalRows =
        summary?.total_rows ??
        assets.reduce((acc, asset) => acc + safeNum(asset.row_count), 0);

      return {
        layer,
        title: `${layer} ${ASSET_LAYER_NAMES[layer] ?? "数据层"}`,
        assets,
        assetCount: summary?.asset_count ?? assets.length,
        readyCount,
        totalRows,
      };
    });
  }, [assetLayerSummary, metaAssets]);

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

  const resolvedCrowdTag = selectedCrowdTag || crowdSummary?.items?.[0]?.tag_code || "";

  const selectedCrowdTagName = useMemo(() => {
    const tagCode = resolvedCrowdTag;
    if (!tagCode) return "暂无标签";
    const item = crowdSummary?.items.find((entry) => entry.tag_code === tagCode);
    return item?.tag_name ?? tagCode;
  }, [crowdSummary, resolvedCrowdTag]);

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
    if (!resolvedCrowdTag) {
      setCrowdVehicles([]);
      setCrowdSegments([]);
      setCrowdVehiclesLoading(false);
      setCrowdSegmentsLoading(false);
      return;
    }

    const cachedVehicles = crowdVehiclesCacheRef.current.get(resolvedCrowdTag);
    const cachedSegments = crowdSegmentsCacheRef.current.get(resolvedCrowdTag);
    if (cachedVehicles) {
      setCrowdVehicles(cachedVehicles);
    } else {
      setCrowdVehicles([]);
    }
    if (cachedSegments) {
      setCrowdSegments(cachedSegments);
    } else {
      setCrowdSegments([]);
    }
    if (cachedVehicles && cachedSegments) return;

    const controller = new AbortController();
    const run = async () => {
      try {
        if (!cachedVehicles) setCrowdVehiclesLoading(true);
        if (!cachedSegments) setCrowdSegmentsLoading(true);
        const [vehicles, segments] = await Promise.all([
          cachedVehicles ??
            fetchCrowdVehicles(resolvedCrowdTag, controller.signal),
          cachedSegments ??
            fetchCrowdSegments(resolvedCrowdTag, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        crowdVehiclesCacheRef.current.set(resolvedCrowdTag, vehicles);
        crowdSegmentsCacheRef.current.set(resolvedCrowdTag, segments);
        setCrowdVehicles(vehicles);
        setCrowdSegments(segments);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "加载圈人结果失败");
        }
      } finally {
        if (!controller.signal.aborted) {
          setCrowdVehiclesLoading(false);
          setCrowdSegmentsLoading(false);
        }
      }
    };
    void run();
    return () => controller.abort();
  }, [resolvedCrowdTag]);

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

  const loadCrowdSegmentGeometry = async (
    segment: CrowdSegment
  ): Promise<CrowdSegment | null> => {
    const roadId = segment.road_id;
    if (!roadId) return null;
    if (segment.geometry) return segment;

    const cachedGeometry = crowdSegmentGeometryCacheRef.current.get(roadId);
    if (cachedGeometry !== undefined) {
      return { ...segment, geometry: cachedGeometry };
    }

    setCrowdGeometryLoadingRoadId(roadId);
    try {
      const item = await fetchCrowdSegmentGeometry(roadId);
      const geometry = item.geometry ?? null;
      crowdSegmentGeometryCacheRef.current.set(roadId, geometry);

      setCrowdSegments((prev) => {
        const next = prev.map((entry) =>
          entry.road_id === roadId
            ? {
                ...entry,
                road_name: entry.road_name ?? item.road_name,
                geometry,
              }
            : entry
        );
        if (resolvedCrowdTag) {
          crowdSegmentsCacheRef.current.set(resolvedCrowdTag, next);
        }
        return next;
      });

      return {
        ...segment,
        road_name: segment.road_name ?? item.road_name,
        geometry,
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载道路几何失败");
      return null;
    } finally {
      setCrowdGeometryLoadingRoadId(null);
    }
  };

  const focusCrowdSegmentOnHeatmap = async (segment: CrowdSegment) => {
    const hydratedSegment = await loadCrowdSegmentGeometry(segment);
    const modalSegment = hydratedSegment ?? segment;
    const nextBbox = parseGeometryBounds(hydratedSegment?.geometry);
    if (nextBbox) {
      const metricDate = selectedDate || heatmapDateOptions[0] || "";
      let bucketStart = metricDate ? buckets[bucketIndex] : "";

      setCrowdRoadMapModal({
        segment: modalSegment,
        bbox: nextBbox,
        heatData: [],
        metricDate: metricDate || undefined,
        bucketStart: bucketStart || undefined,
        loading: Boolean(metricDate),
      });

      if (!metricDate) return;

      try {
        let resolvedBucket = bucketStart;
        if (!resolvedBucket) {
          const bucketItems = await fetchMetaHeatmapBuckets(metricDate);
          resolvedBucket = bucketItems[0] ?? "";
        }
        if (!resolvedBucket) {
          setCrowdRoadMapModal((prev) =>
            prev && prev.segment.road_id === modalSegment.road_id
              ? {
                  ...prev,
                  loading: false,
                  metricDate,
                  bucketStart: undefined,
                }
              : prev
          );
          return;
        }

        const modalHeatData = await fetchHeatmap({
          metricDate,
          bucketStart: resolvedBucket,
          minLat: nextBbox.minLat,
          minLon: nextBbox.minLon,
          maxLat: nextBbox.maxLat,
          maxLon: nextBbox.maxLon,
        });
        setCrowdRoadMapModal((prev) =>
          prev && prev.segment.road_id === modalSegment.road_id
            ? {
                ...prev,
                heatData: modalHeatData,
                metricDate,
                bucketStart: resolvedBucket,
                loading: false,
              }
            : prev
        );
      } catch (e) {
        setCrowdRoadMapModal((prev) =>
          prev && prev.segment.road_id === modalSegment.road_id
            ? { ...prev, loading: false }
            : prev
        );
        setError(e instanceof Error ? e.message : "加载道路热力图失败");
      }
    } else {
      setError("当前道路暂无可定位几何");
    }
  };

  const onRouteMapPickPoint = (
    kind: Exclude<RoutePickMode, "none">,
    point: { lat: number; lon: number }
  ) => {
    setRoutePayload((prev) => {
      if (kind === "start") {
        return {
          ...prev,
          start_point: point,
        };
      }
      return {
        ...prev,
        end_point: point,
      };
    });
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

  const searchMatches = useMemo(() => {
    const keyword = globalSearch.trim().toLowerCase();
    if (!keyword) return [];

    const moduleMatches = navItems
      .filter((item) =>
        [item.title, item.desc, item.group]
          .join(" ")
          .toLowerCase()
          .includes(keyword)
      )
      .map((item) => ({
        key: `module-${item.id}`,
        title: item.title,
        desc: item.desc,
        target: item.id,
      }));

    const assetMatches = metaAssets
      .filter((asset) =>
        [
          asset.display_name,
          asset.description,
          asset.source_table,
          asset.asset_layer,
          asset.asset_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(keyword)
      )
      .slice(0, 5)
      .map((asset) => ({
        key: `asset-${asset.asset_key}`,
        title: asset.display_name,
        desc: `${asset.asset_layer} · ${asset.source_table}`,
        target: "assets" as AppSection,
      }));

    return [...moduleMatches, ...assetMatches].slice(0, 6);
  }, [globalSearch, metaAssets]);

  const applySearchMatch = (target: AppSection) => {
    setActiveSection(target);
    setGlobalSearch("");
  };

  const heatmapMetrics = useMemo(
    () => ({
      roadCount: heatData.length,
      totalFlow: heatData.reduce((acc, item) => acc + safeNum(item.flow_count), 0),
      maxFlow: heatData.reduce(
        (acc, item) => Math.max(acc, safeNum(item.flow_count)),
        0
      ),
    }),
    [heatData]
  );
  const currentBucket = buckets[bucketIndex] ?? "";
  const currentBucketText = currentBucket
    ? currentBucket.replace("T", " ").slice(0, 16)
    : "暂无";
  const currentBucketShort = currentBucket ? currentBucket.slice(11, 16) : "暂无";
  const heatmapStatusText = heatmapBucketsLoading
    ? "时间桶加载中..."
    : heatmapLoading
      ? "热力图更新中..."
      : undefined;

  return (
    <main className="workspace">
      <header className="app-topbar">
        <div className="app-brand">
          <span className="app-mark">DP</span>
          <span>哈尔滨车辆行程分析平台</span>
        </div>
        <div className="topbar-search-wrap">
          <label className="topbar-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="搜索模块或资产"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchMatches[0]) {
                  applySearchMatch(searchMatches[0].target);
                }
              }}
            />
          </label>
          {globalSearch.trim() ? (
            <div className="search-suggestions" role="listbox">
              {searchMatches.length ? (
                searchMatches.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="search-suggestion"
                    onClick={() => applySearchMatch(item.target)}
                  >
                    <span>{item.title}</span>
                    <small>{item.desc}</small>
                  </button>
                ))
              ) : (
                <div className="search-empty">没有匹配结果</div>
              )}
            </div>
          ) : null}
        </div>
        <div className="topbar-meta">
          <span>{latestRefreshText}</span>
          <span
            className={`status-pill ${
              capability?.ready ? "ready" : "warning"
            }`}
          >
            {capability?.ready ? "路径可用" : "待初始化"}
          </span>
        </div>
      </header>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">Workspace</p>
          <h1>工作台</h1>
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
                  aria-current={activeSection === item.id ? "page" : undefined}
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
              aria-pressed={theme === "light"}
              onClick={() => setTheme("light")}
            >
              浅色
            </button>
            <button
              type="button"
              className={`theme-btn ${theme === "dark" ? "active" : ""}`}
              aria-pressed={theme === "dark"}
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
          {activeSection !== "crowd" ? (
            <div className="content-meta">
              <span>热力图日期数：{heatmapDateOptions.length}</span>
              <span>最近刷新：{latestRefreshText}</span>
            </div>
          ) : null}
        </header>

        {error ? (
          <section className="error" role="alert">
            {error}
          </section>
        ) : null}
        {routeErrorHint ? (
          <section className="loading" role="status" aria-live="polite">
            {routeErrorHint}
          </section>
        ) : null}
        {loading ? (
          <section className="loading" role="status" aria-live="polite">
            正在加载后端数据...
          </section>
        ) : null}

        <div key={activeSection} className="panel-fade">
        {activeSection === "status" ? (
          <section className="status-page">
            <section className="kpi-grid status-kpi-grid">
              <article className="card">
                <h3>最近刷新</h3>
                <p>{latestRefreshText}</p>
              </article>
              <article className="card">
                <h3>就绪资产</h3>
                <p>
                  {readyAssetCount}/{assetPortalTotals.totalAssetCount || 0}
                </p>
              </article>
              <article className="card">
                <h3>总行数</h3>
                <p>{assetPortalTotals.totalRows.toLocaleString()}</p>
              </article>
            </section>

            <section className="panel-grid status-detail-grid">
              <article className="panel">
                <div className="status-panel-head">
                  <h4>任务状态</h4>
                  <span
                    className={`status-pill ${
                      latestJob?.status === "success" ? "ready" : "warning"
                    }`}
                  >
                    {latestJob?.status ?? "unknown"}
                  </span>
                </div>
                <p className="recommend-summary">{latestJobText}</p>
                <div className="recommend-stat-row">
                  <span>任务：{latestJob?.job_name ?? "暂无"}</span>
                  <span>
                    开始：
                    {latestJob?.started_at?.replace("T", " ").slice(0, 16) ?? "暂无"}
                  </span>
                  <span>
                    结束：
                    {latestJob?.finished_at?.replace("T", " ").slice(0, 16) ?? "暂无"}
                  </span>
                </div>
              </article>

              <article className="panel">
                <div className="status-panel-head">
                  <h4>路径能力</h4>
                  <span className={`status-pill ${capability?.ready ? "ready" : "warning"}`}>
                    {capability?.ready ? "已就绪" : "待初始化"}
                  </span>
                </div>
                <div className="recommend-reasons">
                  {capabilityStates.map((item) => (
                    <div key={item.label} className="recommend-reason-item">
                      {item.label}：{item.ready ? "已就绪" : "未就绪"}
                    </div>
                  ))}
                </div>
                {capability?.issues?.length ? (
                  <p className="route-capability-issues">{capability.issues.join("; ")}</p>
                ) : null}
              </article>
            </section>

            <section className="panel asset-catalog-panel">
              <h4>资产状态</h4>
              <div className="asset-layer-groups">
                {assetsByLayer.map((group) => (
                  <section
                    key={group.layer}
                    className={`asset-layer-section ${assetLayerClass(group.layer)}`}
                  >
                    <div className="asset-layer-section-head">
                      <strong>{group.title}</strong>
                      <span>
                        {group.readyCount}/{group.assetCount} 就绪 ·{" "}
                        {group.totalRows.toLocaleString()} rows
                      </span>
                    </div>
                    <div className="asset-catalog-list compact-list">
                      {group.assets.map((asset) => (
                        <div key={asset.asset_key} className="asset-catalog-item">
                          <div>
                            <strong>{asset.display_name}</strong>
                            <p>{asset.source_table}</p>
                          </div>
                          <div className="asset-catalog-meta">
                            <span className={`asset-layer-badge ${assetLayerClass(asset.asset_layer)}`}>
                              {asset.asset_layer}
                            </span>
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
                ))}
              </div>
            </section>
          </section>
        ) : null}

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
              <div className="asset-layer-groups">
                {assetsByLayer.map((group) => (
                  <section
                    key={group.layer}
                    className={`asset-layer-section ${assetLayerClass(group.layer)}`}
                  >
                    <div className="asset-layer-section-head">
                      <strong>{group.title}</strong>
                      <span>
                        {group.readyCount}/{group.assetCount} 就绪 ·{" "}
                        {group.totalRows.toLocaleString()} rows
                      </span>
                    </div>
                    <div className="asset-catalog-list">
                      {group.assets.map((asset) => (
                        <div key={asset.asset_key} className="asset-catalog-item">
                          <div>
                            <strong>{asset.display_name}</strong>
                            <p>{asset.description ?? asset.source_table}</p>
                          </div>
                          <div className="asset-catalog-meta">
                            <span className={`asset-layer-badge ${assetLayerClass(asset.asset_layer)}`}>
                              {asset.asset_layer}
                            </span>
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
          <section className="panel map-workspace heatmap-workspace">
            <div className="map-config-pane">
              <div className="playback-controls config-controls">
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
                  时间轴
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, buckets.length - 1)}
                    value={bucketIndex}
                    disabled={!buckets.length || heatmapBucketsLoading}
                    onChange={(e) => setBucketIndex(Number(e.target.value))}
                  />
                  <span className="time-slider-value">{currentBucketShort}</span>
                </label>
                <button
                  type="button"
                  aria-pressed={isPlaying}
                  disabled={buckets.length <= 1 || heatmapBucketsLoading}
                  onClick={() => setIsPlaying((v) => !v)}
                >
                  {isPlaying ? "暂停" : "播放"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setBbox({
                      minLat: 45.7,
                      minLon: 126.55,
                      maxLat: 45.82,
                      maxLon: 126.75,
                    })
                  }
                >
                  缩放到框选范围
                </button>
                <button type="button" onClick={() => setBbox(null)}>
                  重置范围
                </button>
              </div>

              <div className="heatmap-toolbar compact-toolbar">
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

              <div className="map-metrics">
                <span>当前时间桶</span>
                <strong>{currentBucketText}</strong>
                <span>道路 {heatmapMetrics.roadCount} 条</span>
                <span>总流量 {heatmapMetrics.totalFlow.toLocaleString()}</span>
                <span>峰值 {heatmapMetrics.maxFlow.toLocaleString()}</span>
              </div>
            </div>

            <div className="map-view-pane">
              <MapDisplay
                mode="heatmap"
                title="道路流量热力图（MapLibre GL）"
                tileTemplates={mapTileTemplates}
                heatData={heatData}
                showHeatmap={showHeatmapOnMap}
                bbox={bbox}
                statusText={heatmapStatusText}
              />
            </div>
          </section>
        ) : null}

        {activeSection === "route" ? (
          <section className="route-panel map-workspace route-workspace">
            <div className="map-config-pane">
              <div className="route-capability-strip" aria-label="路径能力状态">
                <span>
                  路径能力 <strong>{capability?.ready ? "已就绪" : "未就绪"}</strong>
                </span>
                {capability?.edge_count !== undefined ? (
                  <span>
                    边数量 <strong>{capability.edge_count.toLocaleString()}</strong>
                  </span>
                ) : null}
                {capability?.speed_bins_count !== undefined ? (
                  <span>
                    速度桶 <strong>{capability.speed_bins_count.toLocaleString()}</strong>
                  </span>
                ) : null}
              </div>
              {capabilityError ? (
                <div className="route-capability-issues">
                  能力检查失败：{capabilityError}
                </div>
              ) : null}
              {!capability?.ready && capability?.issues?.length ? (
                <div className="route-capability-issues">{capability.issues.join("; ")}</div>
              ) : null}

            <div className="inputs compact-inputs">
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
              <div className="route-toggle-group">
                <label className="legend-item route-toggle shortest">
                  <input
                    type="checkbox"
                    checked={showShortestOnMap}
                    onChange={(e) => setShowShortestOnMap(e.target.checked)}
                  />
                  <span>最短路径（青色虚线）</span>
                </label>
                <label className="legend-item route-toggle fastest">
                  <input
                    type="checkbox"
                    checked={showFastestOnMap}
                    onChange={(e) => setShowFastestOnMap(e.target.checked)}
                  />
                  <span>最快路径（橙色实线）</span>
                </label>
              </div>
              <div className="route-action-row">
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
            </div>

            <div className="route-pick-controls">
              <span className="legend-title">地图选点</span>
              <div className="route-action-row">
                <button
                  type="button"
                  className={`secondary-btn ${routePickMode === "start" ? "active-mode" : ""}`}
                  aria-pressed={routePickMode === "start"}
                  onClick={() =>
                    setRoutePickMode((prev) => (prev === "start" ? "none" : "start"))
                  }
                >
                  选择起点
                </button>
                <button
                  type="button"
                  className={`secondary-btn ${routePickMode === "end" ? "active-mode" : ""}`}
                  aria-pressed={routePickMode === "end"}
                  onClick={() =>
                    setRoutePickMode((prev) => (prev === "end" ? "none" : "end"))
                  }
                >
                  选择终点
                </button>
              </div>
              <span className="pick-tip">
                {routePickMode === "none"
                  ? "请先选择模式，再点击地图自动回填坐标"
                  : routePickMode === "start"
                    ? "正在选择起点：请点击地图"
                    : "正在选择终点：请点击地图"}
              </span>
            </div>

            {routeResult ? (
              <div className="route-result-grid">
                <article className="route-card">
                  <h5>最短路径</h5>
                  <div className="route-card-stats">
                    <span>里程</span>
                    <strong>{(routeResult.shortest_route?.distance_m ?? 0).toFixed(1)} m</strong>
                    <span>耗时</span>
                    <strong>{(routeResult.shortest_route?.estimated_time_s ?? 0).toFixed(1)} s</strong>
                  </div>
                  <details className="route-edge-details">
                    <summary>边明细 {routeResult.shortest_route?.edges?.length ?? 0}</summary>
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
                  </details>
                </article>

                <article className="route-card">
                  <h5>最快路径</h5>
                  <div className="route-card-stats">
                    <span>里程</span>
                    <strong>{(routeResult.fastest_route?.distance_m ?? 0).toFixed(1)} m</strong>
                    <span>耗时</span>
                    <strong>{(routeResult.fastest_route?.estimated_time_s ?? 0).toFixed(1)} s</strong>
                  </div>
                  <details className="route-edge-details">
                    <summary>边明细 {routeResult.fastest_route?.edges?.length ?? 0}</summary>
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
                  </details>
                </article>
              </div>
            ) : null}
            </div>

            <div className="map-view-pane">
              <MapDisplay
                mode="route"
                title="路径对比地图（MapLibre GL）"
                tileTemplates={mapTileTemplates}
                routePayload={routePayload}
                routeResult={routeResult}
                routePickMode={routePickMode}
                showShortest={showShortestOnMap}
                showFastest={showFastestOnMap}
                onPickPoint={onRouteMapPickPoint}
              />

              {routeOverlap ? (
                <p className="route-overlap-tip">
                  当前查询时间下，最短路径与最快路径一致。
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeSection === "recommend" ? (
          <section className="recommend-panel map-workspace recommend-workspace">
            <div className="map-config-pane">
              <p className="capability-line">
                输出三类建议：路径推荐、出发时段推荐、拥堵规避建议。
              </p>

                <div className="inputs compact-inputs">
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

                <div className="route-pick-controls">
                  <span className="legend-title">地图选点</span>
                  <button
                    type="button"
                    className={`secondary-btn ${routePickMode === "start" ? "active-mode" : ""}`}
                    aria-pressed={routePickMode === "start"}
                    onClick={() =>
                      setRoutePickMode((prev) => (prev === "start" ? "none" : "start"))
                    }
                  >
                    选择起点
                  </button>
                  <button
                    type="button"
                    className={`secondary-btn ${routePickMode === "end" ? "active-mode" : ""}`}
                    aria-pressed={routePickMode === "end"}
                    onClick={() =>
                      setRoutePickMode((prev) => (prev === "end" ? "none" : "end"))
                    }
                  >
                    选择终点
                  </button>
                  <span className="pick-tip">
                    {routePickMode === "none"
                      ? "选择模式后点击地图回填坐标"
                      : routePickMode === "start"
                        ? "正在选择起点"
                        : "正在选择终点"}
                  </span>
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
            </div>

            <div className="map-view-pane">
              <MapDisplay
                mode="route"
                title="推荐选点地图（MapLibre GL）"
                tileTemplates={mapTileTemplates}
                routePayload={routePayload}
                routeResult={null}
                routePickMode={routePickMode}
                showShortest
                showFastest={false}
                onPickPoint={onRouteMapPickPoint}
              />
            </div>
          </section>
        ) : null}

        {activeSection === "crowd" ? (
          <section className="crowd-panel">
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
                    resolvedCrowdTag === item.tag_code
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
                {crowdVehiclesLoading && !crowdVehicles.length ? (
                  <div className="empty">车辆样本加载中...</div>
                ) : !crowdVehicles.length ? (
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
                {crowdSegmentsLoading && !crowdSegments.length ? (
                  <div className="empty">道路热点加载中...</div>
                ) : !crowdSegments.length ? (
                  <div className="empty">暂无道路热点结果</div>
                ) : (
                  <div className="crowd-list">
                    {crowdSegments.map((segment) => {
                      const geometryLoading =
                        crowdGeometryLoadingRoadId === segment.road_id;
                      return (
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
                              onClick={() => void focusCrowdSegmentOnHeatmap(segment)}
                              disabled={!segment.road_id || geometryLoading}
                            >
                              {geometryLoading ? "加载几何..." : "定位到热力图"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            </section>
          </section>
        ) : null}
        </div>
      </section>

      {crowdRoadMapModal ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setCrowdRoadMapModal(null)}
        >
          <section
            className="road-map-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="road-map-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="road-map-modal-head">
              <div>
                <h4 id="road-map-modal-title">
                  {crowdRoadMapModal.segment.road_name ??
                    crowdRoadMapModal.segment.road_id ??
                    "道路热点"}
                </h4>
                <p>
                  {selectedCrowdTagName} ·{" "}
                  {crowdRoadMapModal.segment.trip_count.toLocaleString()} 次经过 ·{" "}
                  {crowdRoadMapModal.segment.vehicle_count.toLocaleString()} 辆车
                </p>
              </div>
              <button
                type="button"
                className="secondary-btn road-map-close"
                onClick={() => setCrowdRoadMapModal(null)}
                aria-label="关闭道路热力图弹窗"
              >
                关闭
              </button>
            </div>

            <MapDisplay
              mode="heatmap"
              title="道路热力定位"
              tileTemplates={mapTileTemplates}
              bbox={crowdRoadMapModal.bbox}
              heatData={crowdRoadMapModal.heatData}
              highlightGeometry={crowdRoadMapModal.segment.geometry}
              showHeatmap
              statusText={
                crowdRoadMapModal.loading
                  ? "热力加载中..."
                  : crowdRoadMapModal.bucketStart
                    ? `${crowdRoadMapModal.metricDate ?? ""} ${crowdRoadMapModal.bucketStart.slice(11, 16)}`
                    : "仅显示高亮道路"
              }
            />

            <div className="road-map-modal-foot">
              <span>高亮线表示当前道路热点</span>
              <span>
                累计距离 {crowdRoadMapModal.segment.distance_m.toFixed(0)} m
              </span>
              <span>
                平均速度{" "}
                {crowdRoadMapModal.segment.avg_speed_kmh != null
                  ? `${crowdRoadMapModal.segment.avg_speed_kmh.toFixed(1)} km/h`
                  : "暂无"}
              </span>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default App;
