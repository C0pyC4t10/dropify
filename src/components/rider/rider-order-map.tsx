"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigation, AlertTriangle, CheckCircle2, Eye, Hand, Search, X } from "lucide-react";

export interface RiderOrderMapProps {
  pin: { lat: number; lng: number };
  orderNo: string;
  customerName: string;
  address: string;
}

/** SSR-safe wrapper for the Leaflet map. Leaflet touches `window` at import
 *  time, so we dynamic-import the inner component with `ssr: false`. */
const MapDynamic = dynamic(
  () => import("./rider-order-map-impl").then((m) => m.default),
  {
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
  },
);

const RefreshGpsDynamic = dynamic(
  () => import("./rider-order-map-impl").then((m) => m.RefreshGpsButton),
  { ssr: false },
);

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
  const [locating, setLocating] = useState(false);

  // Address search state. The rider can search Nominatim (OpenStreetMap)
  // for the actual spot — useful when the customer's typed address
  // geocoded to the wrong place.
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ displayName: string; lat: number; lng: number; type: string | null; importance: number }>>([]);
  const [resultsOpen, setResultsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset the live pin if the server hands us a new order.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLivePin(props.pin);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.pin.lat, props.pin.lng]);

  // Seed the search box with the stored address on first mount / order
  // change so the rider can pick from Nominatim hits without retyping.
  useEffect(() => {
    if (searchQ === "" && props.address) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchQ(props.address);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.address]);

  const refreshGps = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRiderPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setRiderPos(null);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshGps();
  }, [refreshGps]);

  // Debounced Nominatim search — fires 350 ms after the rider stops
  // typing. Cancels any in-flight request when the input changes.
  useEffect(() => {
    const q = searchQ.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams({ q, limit: "5" });
        if (riderPos) {
          params.set("near", `${riderPos.lat},${riderPos.lng}`);
        }
        const res = await fetch(`/api/geocode/search?${params.toString()}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) {
          setSearchError(json.error || `Search failed (${res.status})`);
          setResults([]);
        } else {
          setResults(json.results as Array<{ displayName: string; lat: number; lng: number; type: string | null; importance: number }>);
          setResultsOpen(true);
        }
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "network error");
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQ, riderPos]);

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

  function pickResult(r: { lat: number; lng: number; displayName: string }) {
    setLivePin({ lat: r.lat, lng: r.lng });
    setResultsOpen(false);
    setSearchQ(r.displayName.split(",")[0]); // keep the name in the input
  }

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
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Hand size={14} aria-hidden />
          Pin moved to your selection. Navigate will use this point.
        </div>
      )}

      {/* Address search — Nominatim-powered autocomplete. Defaults to the
          stored address so the rider can pick "the right one" without
          retyping the whole thing. */}
      <div style={{ position: "relative" }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderRadius: 10,
          background: "var(--bg-elevated)",
          border: "1px solid var(--color-border)",
        }}>
          <Search size={16} aria-hidden style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            type="search"
            inputMode="search"
            value={searchQ}
            placeholder="Search for the right spot (street, building, landmark…)"
            onChange={(e) => setSearchQ(e.target.value)}
            onFocus={() => { if (results.length > 0) setResultsOpen(true); }}
            style={{
              flex: 1,
              minWidth: 0,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--color-text)",
              fontSize: 14,
              padding: 0,
              fontFamily: "inherit",
            }}
            aria-label="Search for exact location"
          />
          {searching && (
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>…</span>
          )}
          {searchQ && !searching && (
            <button
              type="button"
              onClick={() => { setSearchQ(""); setResults([]); setResultsOpen(false); }}
              aria-label="Clear search"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text-muted)",
                cursor: "pointer",
                padding: 0,
                display: "inline-flex",
              }}
            >
              <X size={16} aria-hidden />
            </button>
          )}
        </div>

        {resultsOpen && results.length > 0 && (
          <ul
            role="listbox"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 1000,
              maxHeight: 240,
              overflowY: "auto",
              listStyle: "none",
              padding: 4,
              margin: 0,
              background: "var(--bg-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            }}
          >
            {results.map((r, i) => (
              <li key={`${r.lat}-${r.lng}-${i}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => pickResult(r)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    background: "transparent",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    color: "var(--color-text)",
                    fontSize: 13,
                    lineHeight: 1.4,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {r.displayName.split(",").slice(0, 1)[0]}
                    {r.type && (
                      <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: "var(--color-text-muted)" }}>
                        {r.type}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.displayName.split(",").slice(1).join(",").trim()}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searchError && (
          <div style={{ fontSize: 12, color: "var(--color-danger)", marginTop: 6 }}>{searchError}</div>
        )}
      </div>

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
        <RefreshGpsDynamic onClick={refreshGps} locating={locating} />
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minHeight: 36,
            padding: "0 10px",
            borderRadius: 8,
            background: "transparent",
            color: "var(--color-text-secondary)",
            textDecoration: "none",
            fontSize: 12,
            fontWeight: 600,
          }}
          aria-label="Open pin location in Maps"
        >
          <Eye size={12} aria-hidden /> Map view (no directions)
        </a>
      </div>
    </div>
  );
}