"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapStop {
  orderId: number;
  lat: number;
  lng: number;
  label: string; // e.g. "1", "2", "3" or shop name
  title: string; // hover title (customer name, order no)
  body?: React.ReactNode;
  /** Tailwind/hex color for the pin. Defaults to accent green. */
  color?: string;
}

export interface RouteMapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  shop: { lat: number; lng: number; label?: string };
  shopLabel?: string;
  stops: MapStop[];
  /** If true, draw a polyline connecting shop → stop1 → stop2 → ... in order. */
  drawRoute?: boolean;
  /** Polyline color. Defaults to accent green. */
  routeColor?: string;
  /** Height in CSS units. Defaults to 100%. */
  height?: number | string;
  /**
   * If true, fit map bounds to all stops + shop on load AND whenever the set
   * of coordinates actually changes (e.g. when the planner first loads
   * selected orders). Once the user pans/zooms, auto-fit is disabled to
   * stop fighting the user.
   */
  fitBounds?: boolean;
  /**
   * If provided, the shop pin becomes draggable. Called with the new
   * lat/lng on drag end. Default: false (shop stays pinned). Settings
   * page is the only place we want this enabled.
   */
  onShopMove?: (p: { lat: number; lng: number }) => void;
}

// ---------------------------------------------------------------------------
// Icon factory + module-level cache. Leaflet recreates the DOM element every
// time the `icon` prop changes, so we MUST return the same DivIcon instance
// for any given (seq, color) tuple across renders — otherwise every parent
// state change re-mounts every marker and the map stutters.
// ---------------------------------------------------------------------------

function buildNumberedHtml(seq: number | string, color: string, ringColor: string): string {
  return `
    <div style="position:relative;width:36px;height:36px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:${ringColor};animation:rt-pin-pulse 2s ease-out infinite;"></div>
      <div style="position:absolute;inset:6px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;line-height:1;box-shadow:0 2px 6px rgba(0,0,0,0.25);border:2px solid #fff;">${seq}</div>
    </div>
  `;
}
function buildShopHtml(label: string): string {
  return `
    <div style="position:relative;width:34px;height:42px;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25));">
      <div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#b91c1c;border:2px solid #fff;display:flex;align-items:center;justify-content:center;">
        <div style="transform:rotate(45deg);color:#fff;font-size:14px;font-weight:800;">🏪</div>
      </div>
      <div style="font-size:10px;font-weight:700;color:#b91c1c;background:#fff;padding:1px 5px;border-radius:4px;margin-top:2px;border:1px solid #b91c1c;white-space:nowrap;">${label}</div>
    </div>
  `;
}

const numberedIconCache = new Map<string, L.DivIcon>();
function getNumberedIcon(seq: number | string, color: string): L.DivIcon {
  const key = `${seq}::${color}`;
  const cached = numberedIconCache.get(key);
  if (cached) return cached;
  const ringColor = color === "var(--color-success)" ? "var(--tint-brand-25)" : "rgba(0,0,0,0.18)";
  const icon = L.divIcon({
    className: "rt-pin",
    html: buildNumberedHtml(seq, color, ringColor),
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
  numberedIconCache.set(key, icon);
  return icon;
}

const shopIconCache = new Map<string, L.DivIcon>();
function getShopIcon(label: string): L.DivIcon {
  const cached = shopIconCache.get(label);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "rt-shop",
    html: buildShopHtml(label),
    iconSize: [34, 42],
    iconAnchor: [17, 36],
    popupAnchor: [0, -36],
  });
  shopIconCache.set(label, icon);
  return icon;
}

// ---------------------------------------------------------------------------
// FitBoundsOnChange — re-fit only when the set of point COORDINATES actually
// changes. Uses a memoized signature string instead of a JSON.stringify in
// the dep array (which was running on every parent render and stealing the
// user's pan/zoom).
// ---------------------------------------------------------------------------

function FitBoundsOnChange({ signature }: { signature: string }) {
  const map = useMap();
  // Re-fit whenever the SET of coordinates changes. Reordering stops (same
  // set, different order) does NOT change this signature, so we don't
  // fight the user. Adding a brand-new order or first-load does.
  const lastSigRef = useRef<string>("");
  useEffect(() => {
    if (!signature) return;
    if (signature === lastSigRef.current) return;
    lastSigRef.current = signature;
    const points = signature.split("|").filter(Boolean).map((p) => {
      const [lat, lng] = p.split(",").map(Number);
      return { lat, lng };
    });
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [map, signature]);
  return null;
}

function ShopDragger({
  onMove,
}: {
  onMove: (p: { lat: number; lng: number }) => void;
}) {
  // Capture map clicks so the user can also tap-to-move the shop pin.
  useMapEvents({
    click(e) {
      onMove({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function RouteMap({
  center,
  zoom = 12,
  shop,
  shopLabel = "Shop",
  stops,
  drawRoute = true,
  routeColor = "var(--color-success)",
  height = 480,
  fitBounds = true,
  onShopMove,
}: RouteMapProps) {
  // Stable icon instances — cached at module level so React doesn't see a new
  // prop every render and Leaflet doesn't re-mount the marker DOM.
  const shopIcon = useMemo(() => getShopIcon(shopLabel), [shopLabel]);

  // Polyline geometry (only when drawRoute is on and we have ≥2 points).
  const route: Array<[number, number]> = useMemo(() => {
    if (!drawRoute) return [];
    return [shop, ...stops].map((p) => [p.lat, p.lng] as [number, number]);
  }, [drawRoute, shop.lat, shop.lng, stops]);

  // Stable signature for fitBounds. Sorted by lat,lng so that reordering the
  // same set of stops does NOT change the signature (and therefore does
  // NOT re-fit the map). Adding a new stop or first-load does.
  const fitSignature = useMemo(() => {
    if (!fitBounds) return "";
    const all = [shop, ...stops].map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`);
    if (all.length === 0) return "";
    all.sort();
    return all.join("|");
  }, [fitBounds, shop.lat, shop.lng, stops]);

  const shopEventHandlers = useMemo(
    () =>
      onShopMove
        ? {
            dragend: (e: L.LeafletEvent) => {
              const m = e.target as L.Marker;
              const ll = m.getLatLng();
              onShopMove({ lat: ll.lat, lng: ll.lng });
            },
          }
        : undefined,
    [onShopMove],
  );

  return (
    <div style={{ height, width: "100%", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
      <style>{`
        @keyframes rt-pin-pulse {
          0%   { transform: scale(0.6); opacity: 0.8; }
          80%  { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        .rt-pin, .rt-shop { background: transparent !important; border: 0 !important; }
        .leaflet-popup-content-wrapper { border-radius: 8px; }
        .leaflet-popup-content { margin: 10px 12px; font-size: 12px; line-height: 1.4; }
        .leaflet-container { font-family: inherit; background: #1a1a1a; }
        .leaflet-control-attribution { font-size: 10px; opacity: 0.7; }
        ${onShopMove ? ".rt-shop { cursor: grab !important; } .rt-shop:active { cursor: grabbing !important; }" : ""}
      `}</style>
      <MapContainer
        {...({
          center: [center.lat, center.lng],
          zoom,
          scrollWheelZoom: true,
          zoomAnimation: true,
          fadeAnimation: true,
          markerZoomAnimation: true,
          keepBuffer: 2,
          wheelDebounceTime: 40,
          wheelPxPerZoomLevel: 100,
          zoomSnap: 0.5,
          zoomDelta: 0.5,
          inertia: true,
          inertiaDeceleration: 2000,
          style: { height: "100%", width: "100%" },
        } as any)}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          // Larger tile size buffer to hide tile-loading flicker while panning
          updateWhenIdle
        />

        {fitSignature && <FitBoundsOnChange signature={fitSignature} />}

        <Marker
          position={[shop.lat, shop.lng]}
          icon={shopIcon}
          draggable={Boolean(onShopMove)}
          eventHandlers={shopEventHandlers}
        >
          <Popup>
            <strong>{shopLabel}</strong>
            <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>
              {onShopMove ? "Drag or click the map to move" : "Route origin"}
            </div>
          </Popup>
        </Marker>

        {stops.map((s) => (
          <Marker
            key={s.orderId}
            position={[s.lat, s.lng]}
            icon={getNumberedIcon(s.label, s.color ?? routeColor)}
          >
            <Popup>
              <div>
                <strong>{s.title}</strong>
                {s.body}
              </div>
            </Popup>
          </Marker>
        ))}

        {route.length >= 2 && (
          <Polyline
            positions={route}
            pathOptions={{ color: routeColor, weight: 4, opacity: 0.85, dashArray: undefined }}
          />
        )}

        {onShopMove && <ShopDragger onMove={onShopMove} />}
      </MapContainer>
    </div>
  );
}

// Memoize so that parent re-renders (e.g. while dragging a stop in the side
// list) don't rebuild the entire Leaflet map. The map only re-renders when
// its serialized props actually change.
export default memo(RouteMap, (prev, next) => {
  return (
    prev.height === next.height &&
    prev.zoom === next.zoom &&
    prev.shopLabel === next.shopLabel &&
    prev.drawRoute === next.drawRoute &&
    prev.routeColor === next.routeColor &&
    prev.fitBounds === next.fitBounds &&
    prev.onShopMove === next.onShopMove &&
    prev.center.lat === next.center.lat &&
    prev.center.lng === next.center.lng &&
    prev.shop.lat === next.shop.lat &&
    prev.shop.lng === next.shop.lng &&
    prev.stops === next.stops
  );
});
