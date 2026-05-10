import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { HeatItem, RoutePayload, RouteResult } from "../../api";

type GeoJsonSourceLike = { setData: (data: unknown) => void };
type MapBounds = [[number, number], [number, number]];

export type MapBBox = {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
};

export type MapPickMode = "none" | "start" | "end";

type MapInstanceLike = {
  addControl: (control: unknown, position?: string) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource: (id: string) => unknown;
  getLayer: (id: string) => unknown;
  setLayoutProperty: (id: string, name: string, value: string) => void;
  fitBounds: (bounds: MapBounds, opts: { padding: number; duration: number }) => void;
  setMaxBounds?: (bounds: MapBounds) => void;
  setMinZoom?: (zoom: number) => void;
  remove: () => void;
  resize: () => void;
};

type MaplibreModuleLike = {
  Map: new (cfg: unknown) => MapInstanceLike;
  NavigationControl: new () => unknown;
};

type MapMode = "heatmap" | "route";

type MapDisplayProps = {
  mode: MapMode;
  title: string;
  tileTemplates: string[];
  bbox?: MapBBox | null;
  heatData?: HeatItem[];
  highlightGeometry?: string | null;
  showHeatmap?: boolean;
  routeResult?: RouteResult | null;
  routePayload?: RoutePayload;
  routePickMode?: MapPickMode;
  showShortest?: boolean;
  showFastest?: boolean;
  statusText?: string;
  onPickPoint?: (kind: Exclude<MapPickMode, "none">, point: { lat: number; lon: number }) => void;
};

const emptyFeatureCollection = { type: "FeatureCollection", features: [] };
const defaultDataBounds: MapBBox = {
  minLat: 45.62,
  minLon: 126.42,
  maxLat: 45.88,
  maxLon: 126.88,
};

function boundsFromCoordinates(coords: number[][]): MapBBox | null {
  const validCoords = coords.filter(
    (point) =>
      point.length >= 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1])
  );
  if (!validCoords.length) return null;
  const lons = validCoords.map((point) => point[0]);
  const lats = validCoords.map((point) => point[1]);
  return {
    minLat: Math.min(...lats),
    minLon: Math.min(...lons),
    maxLat: Math.max(...lats),
    maxLon: Math.max(...lons),
  };
}

function expandBounds(bounds: MapBBox, ratio = 0.24, minPad = 0.015): MapBBox {
  const latPad = Math.max((bounds.maxLat - bounds.minLat) * ratio, minPad);
  const lonPad = Math.max((bounds.maxLon - bounds.minLon) * ratio, minPad);
  return {
    minLat: Math.max(-85, bounds.minLat - latPad),
    minLon: Math.max(-180, bounds.minLon - lonPad),
    maxLat: Math.min(85, bounds.maxLat + latPad),
    maxLon: Math.min(180, bounds.maxLon + lonPad),
  };
}

function toMapBounds(bounds: MapBBox): MapBounds {
  return [
    [bounds.minLon, bounds.minLat],
    [bounds.maxLon, bounds.maxLat],
  ];
}

function minZoomForBounds(bounds: MapBBox): number {
  const span = Math.max(bounds.maxLat - bounds.minLat, bounds.maxLon - bounds.minLon);
  if (span <= 0.03) return 12;
  if (span <= 0.08) return 11;
  if (span <= 0.18) return 10;
  if (span <= 0.36) return 9;
  return 8;
}

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

function toHeatFeatures(items: HeatItem[]) {
  return items.flatMap((item) => {
    try {
      const geom = JSON.parse(item.geometry) as {
        type?: string;
        coordinates?: unknown;
      };
      const properties = {
        road_id: item.road_id,
        road_name: item.road_name,
        flow_count: item.flow_count,
        distance_m: item.distance_m,
      };
      if (geom?.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
        return geom.coordinates.map((lineCoords) => ({
          type: "Feature",
          properties,
          geometry: { type: "LineString", coordinates: lineCoords },
        }));
      }
      if (geom?.type === "LineString") {
        return [
          {
            type: "Feature",
            properties,
            geometry: geom,
          },
        ];
      }
    } catch {
      return [];
    }
    return [];
  });
}

function toLineFeaturesFromGeoJson(geometryText?: string | null) {
  if (!geometryText) return [];
  try {
    const geom = JSON.parse(geometryText) as {
      type?: string;
      coordinates?: unknown;
    };
    if (geom?.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
      return geom.coordinates
        .filter((lineCoords): lineCoords is number[][] => Array.isArray(lineCoords))
        .map((lineCoords) => ({
          type: "Feature",
          properties: { kind: "highlight" },
          geometry: { type: "LineString", coordinates: lineCoords },
        }));
    }
    if (geom?.type === "LineString" && Array.isArray(geom.coordinates)) {
      return [
        {
          type: "Feature",
          properties: { kind: "highlight" },
          geometry: geom,
        },
      ];
    }
  } catch {
    return [];
  }
  return [];
}

function toRouteFeatures(routeResult: RouteResult | null | undefined) {
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

  return { shortestFeatures, fastestFeatures };
}

function coordinatesFromLineFeatures(features: Array<{ geometry?: { coordinates?: unknown } }>) {
  return features.flatMap((feature) =>
    Array.isArray(feature.geometry?.coordinates)
      ? (feature.geometry.coordinates as number[][])
      : []
  );
}

function attachHeatmapLayers(map: MapInstanceLike) {
  map.addSource("heat-lines", {
    type: "geojson",
    data: emptyFeatureCollection,
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

  map.addSource("highlight-lines", {
    type: "geojson",
    data: emptyFeatureCollection,
  });
  map.addLayer({
    id: "highlight-lines-glow",
    type: "line",
    source: "highlight-lines",
    paint: {
      "line-color": "#fff2a8",
      "line-width": 14,
      "line-opacity": 0.42,
      "line-blur": 2,
    },
  });
  map.addLayer({
    id: "highlight-lines-case",
    type: "line",
    source: "highlight-lines",
    paint: {
      "line-color": "#152033",
      "line-width": 8,
      "line-opacity": 0.92,
    },
  });
  map.addLayer({
    id: "highlight-lines-layer",
    type: "line",
    source: "highlight-lines",
    paint: {
      "line-color": "#ffd64a",
      "line-width": 5,
      "line-opacity": 1,
    },
  });
}

function attachRouteLayers(map: MapInstanceLike) {
  map.addSource("shortest-route-lines", {
    type: "geojson",
    data: emptyFeatureCollection,
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
    data: emptyFeatureCollection,
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
    data: emptyFeatureCollection,
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
}

function setLayerVisibility(map: MapInstanceLike, layerId: string, visible: boolean) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
}

export function MapDisplay({
  mode,
  title,
  tileTemplates,
  bbox,
  heatData = [],
  highlightGeometry = null,
  showHeatmap = true,
  routeResult = null,
  routePayload,
  routePickMode = "none",
  showShortest = true,
  showFastest = true,
  statusText,
  onPickPoint,
}: MapDisplayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstanceLike | null>(null);
  const mountedRef = useRef(false);
  const routePickModeRef = useRef<MapPickMode>(routePickMode);
  const onPickPointRef = useRef(onPickPoint);
  const [mapReadyTick, setMapReadyTick] = useState(0);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const resolvedTileTemplates = useMemo(
    () =>
      tileTemplates.length
        ? tileTemplates
        : ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    [tileTemplates]
  );
  const heatFeatures = useMemo(() => toHeatFeatures(heatData), [heatData]);
  const highlightFeatures = useMemo(
    () => toLineFeaturesFromGeoJson(highlightGeometry),
    [highlightGeometry]
  );
  const { shortestFeatures, fastestFeatures } = useMemo(
    () => toRouteFeatures(routeResult),
    [routeResult]
  );
  const dataBounds = useMemo(() => {
    if (mode === "heatmap") {
      return defaultDataBounds;
    }

    const routeCoords = coordinatesFromLineFeatures([
      ...shortestFeatures,
      ...fastestFeatures,
    ]);
    if (routePayload) {
      routeCoords.push(
        [routePayload.start_point.lon, routePayload.start_point.lat],
        [routePayload.end_point.lon, routePayload.end_point.lat]
      );
    }
    return boundsFromCoordinates(routeCoords) ?? defaultDataBounds;
  }, [
    fastestFeatures,
    mode,
    routePayload,
    shortestFeatures,
  ]);
  const routeViewportBounds = useMemo(
    () => expandBounds(defaultDataBounds, 0.42, 0.035),
    []
  );
  const constrainedBounds = useMemo(
    () =>
      mode === "route" ? routeViewportBounds : expandBounds(dataBounds, 0.42, 0.035),
    [dataBounds, mode, routeViewportBounds]
  );
  const dataMinZoom = useMemo(
    () =>
      mode === "route"
        ? minZoomForBounds(routeViewportBounds)
        : minZoomForBounds(constrainedBounds),
    [constrainedBounds, mode, routeViewportBounds]
  );

  useEffect(() => {
    routePickModeRef.current = routePickMode;
  }, [routePickMode]);

  useEffect(() => {
    onPickPointRef.current = onPickPoint;
  }, [onPickPoint]);

  const initializeMap = useCallback(async () => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    setMapError(null);
    try {
      const maplibre = (await import("maplibre-gl"))
        .default as unknown as MaplibreModuleLike;
      if (!mountedRef.current || mapRef.current) return;
      const map = new maplibre.Map({
        container,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: resolvedTileTemplates,
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
        minZoom: minZoomForBounds(defaultDataBounds),
        maxBounds: toMapBounds(expandBounds(defaultDataBounds, 0.42, 0.035)),
      });
      mapRef.current = map;
      map.addControl(new maplibre.NavigationControl(), "top-right");
      map.on("load", () => {
        if (!mountedRef.current) return;
        if (mode === "heatmap") {
          attachHeatmapLayers(map);
        }
        if (mode === "route") {
          attachRouteLayers(map);
          map.on("click", (eventArg) => {
            const currentPickMode = routePickModeRef.current;
            if (currentPickMode === "none") return;
            const e = eventArg as { lngLat: { lat: number; lng: number } };
            onPickPointRef.current?.(currentPickMode, {
              lat: Number(e.lngLat.lat.toFixed(6)),
              lon: Number(e.lngLat.lng.toFixed(6)),
            });
          });
        }
        setIsMapReady(true);
        setMapReadyTick((v) => v + 1);
      });
    } catch (e) {
      setMapError(e instanceof Error ? e.message : "地图加载失败");
    }
  }, [mode, resolvedTileTemplates]);

  useEffect(() => {
    mountedRef.current = true;
    void initializeMap();
    const resizeTimer = window.setTimeout(() => mapRef.current?.resize(), 0);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(resizeTimer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [initializeMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || mode !== "heatmap") return;
    const src = map.getSource("heat-lines") as GeoJsonSourceLike | undefined;
    src?.setData({ type: "FeatureCollection", features: heatFeatures });
    const highlightSource = map.getSource("highlight-lines") as
      | GeoJsonSourceLike
      | undefined;
    highlightSource?.setData({
      type: "FeatureCollection",
      features: highlightFeatures,
    });
  }, [heatFeatures, highlightFeatures, isMapReady, mapReadyTick, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || mode !== "route") return;
    const shortestSource = map.getSource("shortest-route-lines") as
      | GeoJsonSourceLike
      | undefined;
    const fastestSource = map.getSource("fastest-route-lines") as
      | GeoJsonSourceLike
      | undefined;
    const pointsSource = map.getSource("route-points") as GeoJsonSourceLike | undefined;
    shortestSource?.setData({
      type: "FeatureCollection",
      features: shortestFeatures,
    });
    fastestSource?.setData({
      type: "FeatureCollection",
      features: fastestFeatures,
    });
    if (routePayload) {
      pointsSource?.setData({
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
    }
  }, [
    fastestFeatures,
    isMapReady,
    mapReadyTick,
    mode,
    routePayload,
    shortestFeatures,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;
    if (mode === "heatmap") {
      setLayerVisibility(map, "heat-lines-layer", showHeatmap);
      setLayerVisibility(map, "heat-lines-glow", showHeatmap);
    }
    if (mode === "route") {
      setLayerVisibility(map, "shortest-route-lines-layer", showShortest);
      setLayerVisibility(map, "fastest-route-lines-layer", showFastest);
      setLayerVisibility(map, "route-points-layer", showShortest || showFastest);
    }
  }, [isMapReady, mode, showFastest, showHeatmap, showShortest]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || !bbox) return;
    map.fitBounds(toMapBounds(bbox), { padding: 20, duration: 500 });
  }, [bbox, isMapReady, mapReadyTick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;
    map.setMinZoom?.(dataMinZoom);
    map.setMaxBounds?.(toMapBounds(constrainedBounds));
  }, [constrainedBounds, dataMinZoom, isMapReady]);

  const statusLabel = mapError ?? (!isMapReady ? "地图加载中..." : statusText);
  const hasStatus = Boolean(statusLabel);

  return (
    <div className={`map-wrap map-display map-display-${mode}`}>
      <div className="map-head">
        <span>{title}</span>
        <span
          className={`map-status-icon ${hasStatus ? "active" : ""} ${
            mapError ? "error" : "loading"
          }`}
          role={mapError ? "alert" : "status"}
          aria-live="polite"
          aria-label={statusLabel ?? "地图状态空闲"}
          title={statusLabel ?? ""}
        >
          <span aria-hidden="true">{mapError ? "!" : ""}</span>
        </span>
      </div>
      <div className="map-shell">
        <div
          ref={containerRef}
          className="map-canvas"
          role="application"
          aria-label={`${title}地图展示区域`}
        />
      </div>
    </div>
  );
}
