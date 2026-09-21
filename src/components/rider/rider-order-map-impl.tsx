"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import { RefreshCw } from "lucide-react";

export interface RiderOrderMapProps {
  pin: { lat: number; lng: number };
  orderNo: string;
  customerName: string;
  address: string;
  /** Optional: when true, the rider can tap anywhere on the map to relocate
   *  the pin. The updated pin position is reported via onPinMove. */
  allowRelocate?: boolean;
  onPinMove?: (newPin: { lat: number; lng: number }) => void;
}

/** Inner component that knows the rider's GPS and renders the Leaflet map.
 *  Imported via next/dynamic with ssr:false — see rider-order-map.tsx. */
export default function RiderOrderMapImpl({
  pin,
  orderNo,
  customerName,
  address,
  allowRelocate = false,
  onPinMove,
}: RiderOrderMapProps) {
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "locating" | "ok" | "denied" | "error">("idle");

  function refreshGps() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGpsStatus("error");
      return;
    }
    setGpsStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRiderPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus("ok");
      },
      (err) => {
        setGpsStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshGps();
  }, []);

  // Distance from rider to pin (meters).
  const distanceM = useMemo(() => {
    if (!riderPos) return null;
    const dLat = (pin.lat - riderPos.lat) * Math.PI / 180;
    const dLng = (pin.lng - riderPos.lng) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(riderPos.lat * Math.PI / 180) *
        Math.cos(pin.lat * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return 6371000 * c;
  }, [riderPos, pin.lat, pin.lng]);

  const farWarning = distanceM != null && distanceM > 250;

  // Pin icon — red drop when far from rider, green when confident.
  const pinIcon = useMemo(() => {
    return L.divIcon({
      className: "rdr-pin",
      html: `
        <div style="position:relative;width:32px;height:42px;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25));">
          <div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${farWarning ? "#dc2626" : "#1a7a3a"};border:2px solid #fff;display:flex;align-items:center;justify-content:center;"></div>
          <div style="position:absolute;top:6px;color:#fff;font-weight:800;font-size:11px;line-height:1;">${orderNo.slice(-3)}</div>
        </div>
      `,
      iconSize: [32, 42],
      iconAnchor: [16, 40],
      popupAnchor: [0, -36],
    });
  }, [orderNo, farWarning]);

  // Rider icon — blue dot with pulse.
  const riderIcon = useMemo(() => {
    if (!riderPos) return null;
    return L.divIcon({
      className: "rdr-self",
      html: `
        <div style="position:relative;width:18px;height:18px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;opacity:0.25;animation:rdr-pulse 2s ease-out infinite;"></div>
          <div style="position:absolute;inset:4px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>
        </div>
      `,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }, [riderPos]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <style>{`
        .rdr-pin, .rdr-self { background: transparent !important; border: 0 !important; }
        .leaflet-container { font-family: inherit; background: #1a1a1a; cursor: ${allowRelocate ? "crosshair" : "grab"}; }
        .leaflet-control-attribution { font-size: 9px; opacity: 0.6; }
        .leaflet-control-zoom a { width: 32px; height: 32px; line-height: 32px; font-size: 16px; }
        @keyframes rdr-pulse {
          0%   { transform: scale(0.6); opacity: 0.8; }
          80%  { transform: scale(2); opacity: 0; }
          100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
      <MapContainer
        center={[pin.lat, pin.lng]}
        zoom={16}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <FitBounds pin={pin} riderPos={riderPos} />
        {allowRelocate && onPinMove && <TapToRelocate onMove={onPinMove} />}
        <Marker
          position={[pin.lat, pin.lng]}
          icon={pinIcon}
          draggable={allowRelocate}
          eventHandlers={
            allowRelocate && onPinMove
              ? {
                  dragend: (e: L.LeafletEvent) => {
                    const m = e.target as L.Marker;
                    const ll = m.getLatLng();
                    onPinMove({ lat: ll.lat, lng: ll.lng });
                  },
                }
              : undefined
          }
        >
          <Popup>
            <div style={{ minWidth: 180 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{orderNo}</div>
              <div style={{ fontSize: 12, color: "#444" }}>{customerName}</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{address || "(no address)"}</div>
              {allowRelocate && (
                <div style={{ fontSize: 11, color: "#1d6fe0", marginTop: 6, fontWeight: 600 }}>
                  Drag the pin or tap the map to relocate.
                </div>
              )}
              {farWarning && (
                <div style={{ fontSize: 11, color: "#dc2626", marginTop: 6, fontWeight: 600 }}>
                  Pin may be off — call customer to confirm.
                </div>
              )}
            </div>
          </Popup>
        </Marker>
        {riderPos && riderIcon && (
          <Marker position={[riderPos.lat, riderPos.lng]} icon={riderIcon} />
        )}
      </MapContainer>
      <button
        type="button"
        onClick={refreshGps}
        aria-label="Refresh my location"
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1000,
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        }}
      >
        <RefreshCw
          size={14}
          aria-hidden
          className={gpsStatus === "locating" ? "dropify-spin" : undefined}
        />
      </button>
    </div>
  );
}

/** Decide initial view bounds based on whether we have a rider position. */
function FitBounds({
  pin,
  riderPos,
}: {
  pin: { lat: number; lng: number };
  riderPos: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  const lastSigRef = useRef("");
  useEffect(() => {
    const sig = riderPos
      ? `${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}|${riderPos.lat.toFixed(5)},${riderPos.lng.toFixed(5)}`
      : `${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}`;
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    if (riderPos) {
      const bounds = L.latLngBounds(
        [pin.lat, pin.lng],
        [riderPos.lat, riderPos.lng],
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    } else {
      map.setView([pin.lat, pin.lng], 16);
    }
  }, [map, pin.lat, pin.lng, riderPos]);
  return null;
}

/** Tap-to-relocate handler. Tapping anywhere on the map calls onMove with
 *  the tapped coordinates — the parent updates the pin state and the marker
 *  re-renders at the new spot. */
function TapToRelocate({ onMove }: { onMove: (p: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onMove({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}