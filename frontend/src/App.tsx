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

function BoxplotMini({ data, unit }: { data: BoxRow[]; unit: string }) {
  const [hoverText, setHoverText] = useState<string>("");
  if (!data.length) return <div className="empty">No boxplot data</div>;
  const all = data.flatMap((d) => [d.min_value, d.q1, d.median, d.q3, d.max_value]).filter((v) => Number.isFinite(v));
  if (!all.length) return <div className="empty">No boxplot data</div>;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const height = 210;
  const width = 520;
  const chartTop = 14;
  const chartBottom = 186;
  const usableH = chartBottom - chartTop;
  const band = width / data.length;
  const y = (v: number) => chartBottom - ((v - min) / Math.max(1e-9, max - min)) * usableH;

  const rows = data.filter((d) => [d.min_value, d.q1, d.median, d.q3, d.max_value].every((v) => Number.isFinite(v)));
  return (
    <div className="boxplot-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="boxplot-svg">
        {rows.map((d, i) => {
          const cx = i * band + band / 2;
          const boxW = Math.min(34, band * 0.45);
          return (
            <g key={`${d.trip_date}-${i}`}>
              <line x1={cx} x2={cx} y1={y(d.min_value)} y2={y(d.max_value)} stroke="#7ab8d3" strokeWidth={1.4} />
              <line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={y(d.max_value)} y2={y(d.max_value)} stroke="#7ab8d3" strokeWidth={1.2} />
              <line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={y(d.min_value)} y2={y(d.min_value)} stroke="#7ab8d3" strokeWidth={1.2} />
              <rect
                x={cx - boxW / 2}
                y={y(d.q3)}
                width={boxW}
                height={Math.max(2, y(d.q1) - y(d.q3))}
                fill="rgba(34,211,238,0.35)"
                stroke="#22d3ee"
                strokeWidth={1.2}
                onMouseEnter={() =>
                  setHoverText(
                    `${d.trip_date} | min=${d.min_value.toFixed(2)} ${unit}, q1=${d.q1.toFixed(2)} ${unit}, median=${d.median.toFixed(2)} ${unit}, q3=${d.q3.toFixed(2)} ${unit}, max=${d.max_value.toFixed(2)} ${unit}, n=${d.sample_count}`
                  )
                }
                onMouseLeave={() => setHoverText("")}
              />
              <line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={y(d.median)} y2={y(d.median)} stroke="#ffb74a" strokeWidth={1.8} />
              <title>{`${d.trip_date} min:${d.min_value.toFixed(2)} ${unit}, q1:${d.q1.toFixed(2)} ${unit}, median:${d.median.toFixed(2)} ${unit}, q3:${d.q3.toFixed(2)} ${unit}, max:${d.max_value.toFixed(2)} ${unit}, n:${d.sample_count}`}</title>
              <text x={cx} y={202} textAnchor="middle" className="boxplot-label">
                {(d.trip_date ?? "").slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="boxplot-hover">{hoverText || "Hover a box to see exact values"}</div>
    </div>
  );
}

const defaultRoutePayload: RoutePayload = {
  start_time: "2015-01-03T08:00:00",
  query_time: "2015-01-03T08:00:00",
  start_point: { lat: 45.756, lon: 126.642 },
  end_point: { lat: 45.721, lon: 126.588 },
};

function parseLineStringWkt(wkt: string): number[][] | null {
  const m = wkt.trim().match(/^LINESTRING\s*\((.*)\)$/i);
  if (!m) return null;
  const points = m[1]
    .split(",")
    .map((p) => p.trim().split(/\s+/).map(Number))
    .filter((arr) => arr.length >= 2 && Number.isFinite(arr[0]) && Number.isFinite(arr[1]))
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
  const [bbox, setBbox] = useState<{ minLat: number; minLon: number; maxLat: number; maxLon: number } | null>(null);
  const [capability, setCapability] = useState<RouteCapability | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [showShortestOnMap, setShowShortestOnMap] = useState(true);
  const [showFastestOnMap, setShowFastestOnMap] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<any>(null);
  const maplibreRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

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
        setError(e instanceof Error ? e.message : "Failed to load API data");
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
          e instanceof Error ? e.message : "Failed to load route capability"
        );
      }
    };
    void run();
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let cancelled = false;
    let localMap: any | null = null;

    const setup = async () => {
      const mod = await import("maplibre-gl");
      const maplibre = mod.default;
      maplibreRef.current = maplibre;
      if (cancelled || !mapContainerRef.current) return;

      const map = new maplibre.Map({
        container: mapContainerRef.current,
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
      localMap = map;
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
          "circle-color": ["case", ["==", ["get", "kind"], "start"], "#39ffaf", "#ff5f8f"],
          "circle-stroke-color": "#0b1322",
          "circle-stroke-width": 2,
        },
      });
      });
      mapRef.current = map;
    };

    void setup();

    return () => {
      cancelled = true;
      if (localMap) localMap.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        const items = await fetchHeatmapBuckets(selectedDate);
        setBuckets(items);
        setBucketIndex(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load heatmap buckets");
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
        setError(e instanceof Error ? e.message : "Failed to load heatmap data");
      }
    };
    void run();
  }, [selectedDate, bucketIndex, buckets, bbox]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const src = map.getSource("heat-lines") as GeoJsonSourceLike | undefined;
    if (!src) return;
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
    src.setData({ type: "FeatureCollection", features } as any);
  }, [heatData]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const shortestSource = map.getSource("shortest-route-lines") as GeoJsonSourceLike | undefined;
    const fastestSource = map.getSource("fastest-route-lines") as GeoJsonSourceLike | undefined;
    const pointsSource = map.getSource("route-points") as GeoJsonSourceLike | undefined;
    if (!shortestSource || !fastestSource || !pointsSource) return;

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

    shortestSource.setData({ type: "FeatureCollection", features: shortestFeatures } as any);
    fastestSource.setData({ type: "FeatureCollection", features: fastestFeatures } as any);

    pointsSource.setData(
      {
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
      } as any
    );
  }, [routeResult, routePayload]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (map.getLayer("shortest-route-lines-layer")) {
      map.setLayoutProperty(
        "shortest-route-lines-layer",
        "visibility",
        showShortestOnMap ? "visible" : "none"
      );
    }
    if (map.getLayer("fastest-route-lines-layer")) {
      map.setLayoutProperty(
        "fastest-route-lines-layer",
        "visibility",
        showFastestOnMap ? "visible" : "none"
      );
    }
    if (map.getLayer("route-points-layer")) {
      map.setLayoutProperty(
        "route-points-layer",
        "visibility",
        showShortestOnMap || showFastestOnMap ? "visible" : "none"
      );
    }
  }, [showShortestOnMap, showFastestOnMap]);

  useEffect(() => {
    if (!mapRef.current || !bbox) return;
    mapRef.current.fitBounds(
      [
        [bbox.minLon, bbox.minLat],
        [bbox.maxLon, bbox.maxLat],
      ],
      { padding: 20, duration: 500 }
    );
  }, [bbox]);

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
        const issues = capability?.issues?.join("; ") || "routing capability is not ready";
        throw new Error(issues);
      }
      setRouteResult(await fetchRouteCompare(routePayload));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Route API failed");
    }
  };

  const clearRouteOnMap = () => {
    setShowShortestOnMap(false);
    setShowFastestOnMap(false);
  };

  const clearRouteResult = () => {
    setRouteResult(null);
  };

  const routeOverlap = useMemo(() => {
    const s = routeResult?.shortest_route?.path_wkt_segments ?? [];
    const f = routeResult?.fastest_route?.path_wkt_segments ?? [];
    if (!s.length || !f.length) return false;
    if (s.length !== f.length) return false;
    return s.every((seg, i) => seg === f[i]);
  }, [routeResult]);

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Harbin Vehicle Journey Analytics</p>
          <h1>Urban Mobility Command Board</h1>
          <p className="subtitle">
            H5 + JLD2 merged pipeline, PostGIS-backed metrics, and route comparison
            for shortest-distance versus fastest-time paths.
          </p>
        </div>
      </header>

      {error ? <section className="error">{error}</section> : null}
      {loading ? <section className="loading">Loading backend data...</section> : null}

      <section className="kpi-grid">
        <article className="card">
          <h2>Total Trips</h2>
          <p>{kpis.tripCount.toLocaleString()}</p>
        </article>
        <article className="card">
          <h2>Peak Daily Vehicles</h2>
          <p>{kpis.vehicleCount.toLocaleString()}</p>
        </article>
        <article className="card">
          <h2>Total Distance (km)</h2>
          <p>{kpis.distanceKm.toFixed(2)}</p>
        </article>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h3>Daily Trip Count</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={tripSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value) => [`${tooltipValue(value)}`, "Trips"]} />
              <Bar dataKey="value" fill="#22d3ee" />
            </BarChart>
          </ResponsiveContainer>
        </article>
        <article className="panel">
          <h3>Daily Vehicle Count</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={vehicleSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value) => [`${tooltipValue(value)}`, "Vehicles"]} />
              <Bar dataKey="value" fill="#ffb74a" />
            </BarChart>
          </ResponsiveContainer>
        </article>
        <article className="panel">
          <h3>Daily Distance</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={distanceSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value) => [`${tooltipValue(value).toFixed(2)} km`, "Distance"]} />
              <Line dataKey="value" stroke="#80ecff" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </article>
        <article className="panel">
          <h3>Distance Boxplot</h3>
          <BoxplotMini data={distanceBox} unit="m" />
        </article>
        <article className="panel">
          <h3>Speed Boxplot</h3>
          <BoxplotMini data={speedBox} unit="km/h" />
        </article>
        <article className="panel panel-wide">
          <h3>Heatmap Playback</h3>
          <div className="playback-controls">
            <label>
              Date
              <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>
                {["2015-01-03", "2015-01-04", "2015-01-05", "2015-01-06", "2015-01-07"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start Bucket
              <input
                type="number"
                min={0}
                max={Math.max(0, buckets.length - 1)}
                value={bucketIndex}
                onChange={(e) => setBucketIndex(Number(e.target.value))}
              />
            </label>
            <button type="button" onClick={() => setIsPlaying((v) => !v)}>
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={() =>
                setBbox({ minLat: 45.70, minLon: 126.55, maxLat: 45.82, maxLon: 126.75 })
              }
            >
              Zoom Box
            </button>
            <button type="button" onClick={() => setBbox(null)}>
              Reset Box
            </button>
          </div>
          <div className="map-wrap">
            <div className="map-head">Road Flow Heatmap (MapLibre GL)</div>
            <div ref={mapContainerRef} className="map-canvas" />
          </div>
          <p className="bucket-tip">Current bucket: {buckets[bucketIndex] ?? "N/A"}</p>
        </article>
      </section>

      <section className="route-panel">
        <h3>Route Compare</h3>
        <p className="capability-line">
          Route Capability: {capability?.ready ? "Ready" : "Not Ready"}
          {capability?.edge_count !== undefined ? ` | Edges: ${capability.edge_count.toLocaleString()}` : ""}
          {capability?.speed_bins_count !== undefined ? ` | Speed bins: ${capability.speed_bins_count.toLocaleString()}` : ""}
        </p>
        {capabilityError ? (
          <div className="route-capability-issues">Capability check failed: {capabilityError}</div>
        ) : null}
        {!capability?.ready && capability?.issues?.length ? (
          <div className="route-capability-issues">{capability.issues.join("; ")}</div>
        ) : null}
        <div className="inputs">
          <label>
            Start Time
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
            Query Time
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
            Start Lat
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
            Start Lon
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
            End Lat
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
            End Lon
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
          `Start Time` 用于记录本次路线请求时间；`Query Time` 用于命中 5 分钟速度桶。两者不同时，最快路可能变化，最短路通常不变。
        </p>
        <button onClick={onRunRoute} disabled={!capability?.ready}>Run Route Compare</button>
        <div className="route-map-controls">
          <span className="legend-title">Map Route Layers</span>
          <label className="legend-item shortest">
            <input
              type="checkbox"
              checked={showShortestOnMap}
              onChange={(e) => setShowShortestOnMap(e.target.checked)}
            />
            Shortest (cyan dashed)
          </label>
          <label className="legend-item fastest">
            <input
              type="checkbox"
              checked={showFastestOnMap}
              onChange={(e) => setShowFastestOnMap(e.target.checked)}
            />
            Fastest (orange solid)
          </label>
          <button type="button" className="secondary-btn" onClick={clearRouteOnMap}>
            Clear Route Layers
          </button>
          <button type="button" className="secondary-btn" onClick={clearRouteResult}>
            Clear Route Result
          </button>
        </div>
        {routeOverlap ? (
          <p className="route-overlap-tip">
            Shortest and fastest routes are identical at current query time.
          </p>
        ) : null}
        {routeResult ? (
          <div className="route-result-grid">
            <article className="route-card">
              <h4>Shortest Route</h4>
              <p>Total Distance: {(routeResult.shortest_route?.distance_m ?? 0).toFixed(2)} m</p>
              <p>Total Time: {(routeResult.shortest_route?.estimated_time_s ?? 0).toFixed(2)} s</p>
              <div className="route-edges">
                {(Array.isArray(routeResult.shortest_route?.edges) ? routeResult.shortest_route?.edges : []).map((edge) => (
                  <div key={`short-${edge.seq}-${edge.edge_id}`} className="route-edge-row" title={`road=${edge.road_id ?? "unknown"}, segDist=${edge.distance_m.toFixed(2)}m, segTime=${edge.estimated_time_s.toFixed(2)}s, cumDist=${edge.cumulative_distance_m.toFixed(2)}m, cumTime=${edge.cumulative_time_s.toFixed(2)}s`}>
                    <span>#{edge.seq}</span>
                    <span>edge {edge.edge_id}</span>
                    <span>road {edge.road_id ?? "-"}</span>
                    <span>{safeNum(edge.distance_m).toFixed(1)} m</span>
                    <span>{safeNum(edge.estimated_time_s).toFixed(1)} s</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="route-card">
              <h4>Fastest Route</h4>
              <p>Total Distance: {(routeResult.fastest_route?.distance_m ?? 0).toFixed(2)} m</p>
              <p>Total Time: {(routeResult.fastest_route?.estimated_time_s ?? 0).toFixed(2)} s</p>
              <div className="route-edges">
                {(Array.isArray(routeResult.fastest_route?.edges) ? routeResult.fastest_route?.edges : []).map((edge) => (
                  <div key={`fast-${edge.seq}-${edge.edge_id}`} className="route-edge-row" title={`road=${edge.road_id ?? "unknown"}, segDist=${edge.distance_m.toFixed(2)}m, segTime=${edge.estimated_time_s.toFixed(2)}s, cumDist=${edge.cumulative_distance_m.toFixed(2)}m, cumTime=${edge.cumulative_time_s.toFixed(2)}s`}>
                    <span>#{edge.seq}</span>
                    <span>edge {edge.edge_id}</span>
                    <span>road {edge.road_id ?? "-"}</span>
                    <span>{safeNum(edge.distance_m).toFixed(1)} m</span>
                    <span>{safeNum(edge.estimated_time_s).toFixed(1)} s</span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default App;
