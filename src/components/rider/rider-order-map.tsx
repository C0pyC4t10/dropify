"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { MapPin, Navigation, AlertTriangle, CheckCircle2, Hand } from "lucide-react";

export interface RiderOrderMapProps {
  pin: { lat: number; lng: number };
  orderNo: string;
  customerName: string;
  address: string;
}

/** SSR-safe wrapper for the Leaflet map. Leaflet touches `window` at import
 *  time, so we dynamic-import the inner component with `ssr: false`. */
const MapDynamic = dynamic(() => import("./rider-order-map-impl"), {
  ssr: false,
  loading: () => (
    <div style={{
      height: 220,
      width: "100%",
      borderRadius: 12,
      border: "1px solid var(--color-border)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg-elevated)",
      color: "var(--color-text-muted)",
      fontSize: 13,
    }}>
      Loading map…
    </div>
  ),
});

/** Public component used by the rider order detail page. Renders the
 *  confidence/distance banner + the map + Navigate/View buttons. The
 *  rider can tap anywhere on the map (or drag the pin) to relocate it
 *  if the stored point is approximate. */
export function RiderOrderMap(props: RiderOrderMapProps) {
  // Pin the rider can move. Starts as the server's stored point; if the rider
  // taps/drags the pin, this updates and the navigate URLs follow.
  const [livePin, setLivePin] = useState(props.pin);
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  // Reset the live pin if the server hands us a new order.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLivePin(props.pin);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.pin.lat, props.pin.lng]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setRiderPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setRiderPos(null),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 },
    );
  }, []);

  useEffect(() => {
    if (!riderPos) return;
    const dLat = (livePin.lat - riderPos.lat) * Math.PI / 180;
    const dLng = (livePin.lng - riderPos.lng) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(riderPos.lat * Math.PI / 180) *
        Math.cos(livePin.lat * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDistance(6371000 * c);
  }, [riderPos, livePin.lat, livePin.lng]);

  const farWarning = distance != null && distance > 250;
  const pinMoved = livePin.lat !== props.pin.lat || livePin.lng !== props.pin.lng;

  const navigateUrl = useMemo(
    () => `https://www.google.com/maps/dir/?api=1&destination=${livePin.lat},${livePin.lng}`,
    [livePin.lat, livePin.lng],
  );
  const viewUrl = useMemo(
    () => `https://www.google.com/maps?q=${livePin.lat},${livePin.lng}&z=18`,
    [livePin.lat, livePin.lng],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {farWarning && (
        <div
          role="status"
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--tint-warning-18)",
            color: "var(--color-warning)",
            border: "1px solid var(--tint-warning-25)",
            fontSize: 13,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <AlertTriangle size={16} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Pin is ~{Math.round(distance!)}m from you.</strong> The address might be approximate — drag the pin to the right spot, or call the customer to confirm.
          </div>
        </div>
      )}
      {distance != null && !farWarning && !pinMoved && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            background: "var(--tint-success-18)",
            color: "var(--color-success)",
            border: "1px solid var(--tint-success-25)",
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <CheckCircle2 size={14} aria-hidden />
          Pin looks accurate (~{Math.round(distance)}m from you).
        </div>
      )}
      {pinMoved && (
        <div
          role="status"
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            background: "var(--tint-info-12)",
            color: "var(--color-info)",
            border: "1px solid var(--tint-info-12)",
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Hand size={14} aria-hidden />
          Pin moved to your selection. Navigate will use this point.
        </div>
      )}
      <div style={{ position: "relative" }}>
        <MapDynamic
          {...props}
          pin={livePin}
          allowRelocate
          onPinMove={setLivePin}
        />
        {pinMoved && (
          <button
            type="button"
            onClick={() => setLivePin(props.pin)}
            style={{
              position: "absolute",
              bottom: 10,
              right: 10,
              zIndex: 1000,
              padding: "6px 10px",
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            }}
          >
            Reset to original
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <a
          href={navigateUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            minHeight: 44,
            padding: "0 14px",
            borderRadius: 10,
            background: "var(--color-brand)",
            color: "#fff",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <Navigation size={16} aria-hidden /> Navigate
        </a>
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minHeight: 44,
            padding: "0 12px",
            borderRadius: 10,
            background: "var(--bg-elevated)",
            color: "var(--color-text)",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
            border: "1px solid var(--color-border)",
          }}
          aria-label="View pin on map"
        >
          <MapPin size={14} aria-hidden /> View
        </a>
      </div>
    </div>
  );
}