"use client";

import { memo, useMemo, useRef, useEffect } from "react";
import { MapContainer, TileLayer, Rectangle, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  CLUSTER_META,
  DHAKA_CENTROIDS_RAW,
  getLocationForArea,
  type Cluster,
  type SubCluster,
  SUB_CLUSTER_META,
} from "@/lib/locations";
import { ALL_CLUSTERS } from "@/lib/ui";

/** A translucent rectangle bounding one Dhaka cluster's area centroids. */
export interface ClusterRegion {
  cluster: Cluster;
  bounds: L.LatLngBoundsLiteral; // [[s, w], [n, e]]
  areaCount: number;
  /** Approximate geographic center of the rectangle (for label placement). */
  center: { lat: number; lng: number };
}

export interface DhakaClusterMapProps {
  shop: { lat: number; lng: number; label?: string };
  /** Optional height in CSS units. Defaults to 460. */
  height?: number | string;
}

// ---------------------------------------------------------------------------
// Bounding-box computation. For each cluster we walk its assigned areas and
// take the min/max lat/lng from DHAKA_CENTROIDS_RAW. Areas without a centroid
// fall back to DEFAULT_CENTROID so they're at least represented.
// ---------------------------------------------------------------------------

function computeClusterRegions(): {
  regions: ClusterRegion[];
  subClusterRegions: Array<ClusterRegion & { subCluster: SubCluster; label: string }>;
  overallBounds: L.LatLngBoundsLiteral;
} {
  const clusterAreas: Record<Cluster, string[]> = {
    "DHK-E": [],
    "DHK-NW": [],
    "DHK-CW": [],
    "DHK-SE": [],
  };
  const subAreas: Record<SubCluster, string[]> = {} as Record<SubCluster, string[]>;

  // Build cluster → areas + sub → areas via the LOCATIONS table imported via
  // SUB_CLUSTER_META walk. We can't import LOCATIONS directly (it's not
  // exported), so we iterate SUB_CLUSTER_META and re-derive by scanning the
  // centroid map + the cluster mapping we infer from CLUSTER_META.
  // Simpler approach: use the cluster prefixes (E*, NW*, CW*, SE*) directly on
  // SUB_CLUSTER_META keys — CLUSTER_META.subClusters gives us the mapping.

  // Lazily import LOCATIONS through getLocationForArea — but that doesn't list
  // all areas. Easiest: piggyback on DHAKA_CENTROIDS_RAW by reading each
  // centroid's zone (NW/NE/SW/SE) and the area-name → cluster map we can
  // derive by walking CLUSTER_META.subClusters.
  //
  // However DHAKA_CENTROIDS_RAW doesn't have cluster assignments. So the
  // cleanest way is: for each area in DHAKA_CENTROIDS_RAW, ask
  // getLocationForArea(area) which cluster it belongs to. That's O(n) and
  // fine for a 280-entry map rendered once.

  // We import the helper at the top of the file (getLocationForArea).

  for (const area of Object.keys(DHAKA_CENTROIDS_RAW)) {
    const loc = getLocationForArea(area);
    clusterAreas[loc.cluster].push(area);
    subAreas[loc.subCluster] = subAreas[loc.subCluster] || [];
    subAreas[loc.subCluster].push(area);
  }

  // Compute rectangles per cluster.
  const regions: ClusterRegion[] = ALL_CLUSTERS.map((cluster) => {
    const areas = clusterAreas[cluster];
    const pts = areas.map((a) => DHAKA_CENTROIDS_RAW[a]).filter(Boolean) as Array<{
      lat: number;
      lng: number;
    }>;
    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity;
    for (const p of pts) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    // Pad bounds by 1km so the rectangle breathes around the points.
    const pad = 0.01;
    return {
      cluster,
      bounds: [
        [minLat - pad, minLng - pad],
        [maxLat + pad, maxLng + pad],
      ],
      areaCount: areas.length,
      center: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 },
    };
  });

  // Same idea for sub-clusters (used for labels inside the cluster rectangle).
  const subClusterKeys = Object.keys(SUB_CLUSTER_META) as SubCluster[];
  const subClusterRegions = subClusterKeys
    .map((sub) => {
      const areas = subAreas[sub] || [];
      if (areas.length === 0) return null;
      const pts = areas.map((a) => DHAKA_CENTROIDS_RAW[a]).filter(Boolean) as Array<{
        lat: number;
        lng: number;
      }>;
      if (pts.length === 0) return null;
      let minLat = Infinity,
        maxLat = -Infinity,
        minLng = Infinity,
        maxLng = -Infinity;
      for (const p of pts) {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lng < minLng) minLng = p.lng;
        if (p.lng > maxLng) maxLng = p.lng;
      }
      const loc = getLocationForArea(areas[0]);
      return {
        cluster: loc.cluster,
        subCluster: sub,
        label: SUB_CLUSTER_META[sub].label,
        bounds: [
          [minLat, minLng],
          [maxLat, maxLng],
        ] as L.LatLngBoundsLiteral,
        areaCount: areas.length,
        center: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 },
      };
    })
    .filter(Boolean) as Array<ClusterRegion & { subCluster: SubCluster; label: string }>;

  // Overall bounds = union of all cluster rectangles (with a touch of padding).
  let oMinLat = Infinity,
    oMaxLat = -Infinity,
    oMinLng = Infinity,
    oMaxLng = -Infinity;
  for (const r of regions) {
    const [[s, w], [n, e]] = r.bounds;
    if (s < oMinLat) oMinLat = s;
    if (n > oMaxLat) oMaxLat = n;
    if (w < oMinLng) oMinLng = w;
    if (e > oMaxLng) oMaxLng = e;
  }
  const oPad = 0.02;
  const overallBounds: L.LatLngBoundsLiteral = [
    [oMinLat - oPad, oMinLng - oPad],
    [oMaxLat + oPad, oMaxLng + oPad],
  ];

  return { regions, subClusterRegions, overallBounds };
}

// ---------------------------------------------------------------------------
// Shop pin icon (re-used pattern from route-map.tsx — duplicated here so the
// two components stay decoupled)
// ---------------------------------------------------------------------------

const shopIconCache = new Map<string, L.DivIcon>();
function getShopIcon(label: string): L.DivIcon {
  const cached = shopIconCache.get(label);
  if (cached) return cached;
  const html = `
    <div style="position:relative;width:34px;height:42px;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25));">
      <div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#b91c1c;border:2px solid #fff;display:flex;align-items:center;justify-content:center;">
        <div style="transform:rotate(45deg);color:#fff;font-size:14px;font-weight:800;">🏪</div>
      </div>
      <div style="font-size:10px;font-weight:700;color:#b91c1c;background:#fff;padding:1px 5px;border-radius:4px;margin-top:2px;border:1px solid #b91c1c;white-space:nowrap;">${label}</div>
    </div>
  `;
  const icon = L.divIcon({
    className: "dcm-shop",
    html,
    iconSize: [34, 42],
    iconAnchor: [17, 36],
    popupAnchor: [0, -36],
  });
  shopIconCache.set(label, icon);
  return icon;
}

const labelIconCache = new Map<string, L.DivIcon>();
function getClusterLabelIcon(text: string, color: string): L.DivIcon {
  const key = `${text}::${color}`;
  const cached = labelIconCache.get(key);
  if (cached) return cached;
  const html = `
    <div style="
      font-size:11px;
      font-weight:800;
      letter-spacing:0.05em;
      color:${color};
      background:rgba(0,0,0,0.75);
      padding:3px 8px;
      border-radius:6px;
      border:1.5px solid ${color};
      white-space:nowrap;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
    ">${text}</div>
  `;
  const icon = L.divIcon({
    className: "dcm-label",
    html,
    iconSize: [80, 22],
    iconAnchor: [40, 11],
  });
  labelIconCache.set(key, icon);
  return icon;
}

// ---------------------------------------------------------------------------
// Auto-fit to overall bounds on first load only.
// ---------------------------------------------------------------------------

function FitOnMount({ bounds }: { bounds: L.LatLngBoundsLiteral }) {
  const map = useMap();
  const doneRef = useRef(false);
  useEffect(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
  }, [map, bounds]);
  return null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function DhakaClusterMap({ shop, height = 460 }: DhakaClusterMapProps) {
  const { regions, subClusterRegions, overallBounds } = useMemo(() => computeClusterRegions(), []);

  const shopIcon = useMemo(() => getShopIcon(shop.label ?? "Shop"), [shop.label]);

  // Pick the 2 largest sub-clusters per cluster to show as labels inside
  // the rectangle. Smaller sub-clusters (often single-area) get hidden to
  // avoid label clutter.
  const topSubLabelsByCluster = useMemo(() => {
    const out: Record<Cluster, Array<{ center: { lat: number; lng: number }; label: string }>> = {
      "DHK-E": [],
      "DHK-NW": [],
      "DHK-CW": [],
      "DHK-SE": [],
    };
    for (const c of ALL_CLUSTERS) {
      const subs = [...subClusterRegions]
        .filter((s) => s.cluster === c)
        .sort((a, b) => b.areaCount - a.areaCount)
        .slice(0, 2);
      out[c] = subs.map((s) => ({ center: s.center, label: `${s.subCluster} · ${s.label}` }));
    }
    return out;
  }, [subClusterRegions]);

  return (
    <div style={{ height, width: "100%", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", position: "relative" }}>
      <style>{`
        .dcm-shop, .dcm-label { background: transparent !important; border: 0 !important; }
        .leaflet-container { font-family: inherit; background: #1a1a1a; }
        .leaflet-control-attribution { font-size: 10px; opacity: 0.7; }
        .dcm-rect:hover { opacity: 0.35 !important; }
      `}</style>
      <MapContainer
        {...({
          center: [shop.lat, shop.lng],
          zoom: 11,
          scrollWheelZoom: true,
          zoomAnimation: true,
          fadeAnimation: true,
          markerZoomAnimation: true,
          zoomSnap: 0.5,
          zoomDelta: 0.5,
          inertia: true,
          style: { height: "100%", width: "100%" },
        } satisfies React.ComponentProps<typeof MapContainer>)}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          updateWhenIdle
        />

        <FitOnMount bounds={overallBounds} />

        {/* Translucent cluster rectangles */}
        {regions.map((r) => {
          const meta = CLUSTER_META[r.cluster];
          return (
            <Rectangle
              key={r.cluster}
              bounds={r.bounds}
              pathOptions={{
                color: meta.color,
                weight: 2,
                opacity: 0.9,
                fillColor: meta.color,
                fillOpacity: 0.18,
                className: "dcm-rect",
              }}
            >
              <Popup>
                <div style={{ fontSize: 12, lineHeight: 1.45 }}>
                  <div style={{ fontWeight: 700, color: meta.color, fontSize: 13 }}>{meta.code}</div>
                  <div style={{ fontWeight: 600 }}>{meta.name}</div>
                  <div style={{ color: "#555", marginTop: 4 }}>{meta.description}</div>
                  <div style={{ marginTop: 4, color: "#666" }}>
                    <strong>{r.areaCount}</strong> areas · {meta.subClusters.length} sub-clusters
                  </div>
                </div>
              </Popup>
            </Rectangle>
          );
        })}

        {/* Big cluster-code label in the center of each rectangle */}
        {regions.map((r) => {
          const meta = CLUSTER_META[r.cluster];
          return (
            <Marker
              key={`label-${r.cluster}`}
              position={[r.center.lat, r.center.lng]}
              icon={getClusterLabelIcon(`${meta.code} — ${meta.name.split(" ")[0]}`, meta.color)}
              interactive={false}
              keyboard={false}
            />
          );
        })}

        {/* Smaller sub-cluster labels (top 2 per cluster) */}
        {ALL_CLUSTERS.flatMap((c) =>
          topSubLabelsByCluster[c].map((sl, i) => {
            const meta = CLUSTER_META[c];
            return (
              <Marker
                key={`sub-${c}-${i}`}
                position={[sl.center.lat, sl.center.lng]}
                icon={getClusterLabelIcon(sl.label, meta.color)}
                interactive={false}
                keyboard={false}
              />
            );
          }),
        )}

        {/* Shop pin */}
        <Marker position={[shop.lat, shop.lng]} icon={shopIcon}>
          <Popup>
            <strong>{shop.label ?? "Shop"}</strong>
            <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>
              Route origin · {shop.lat.toFixed(4)}, {shop.lng.toFixed(4)}
            </div>
          </Popup>
        </Marker>
      </MapContainer>

      {/* Legend overlay (top-right corner of the container) */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "rgba(0,0,0,0.78)",
          backdropFilter: "blur(8px)",
          padding: "10px 12px",
          borderRadius: 8,
          fontSize: 11,
          color: "#fff",
          zIndex: 500,
          border: "1px solid rgba(255,255,255,0.1)",
          minWidth: 150,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6, letterSpacing: "0.04em", fontSize: 10, textTransform: "uppercase", color: "#aaa" }}>
          Dhaka Delivery Grid
        </div>
        {regions.map((r) => {
          const meta = CLUSTER_META[r.cluster];
          return (
            <div key={r.cluster} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: meta.color,
                  opacity: 0.55,
                  border: `1.5px solid ${meta.color}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 600 }}>{meta.code}</span>
              <span style={{ color: "#bbb" }}>{meta.name}</span>
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0", marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", background: "#b91c1c", flexShrink: 0, border: "1.5px solid #fff" }} />
          <span style={{ fontWeight: 600 }}>{shop.label ?? "Shop"}</span>
        </div>
      </div>
    </div>
  );
}

export default memo(DhakaClusterMap);