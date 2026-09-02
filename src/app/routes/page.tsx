"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Bike,
  MapPin,
  Package,
  Calendar,
  Search,
  Compass,
  Crosshair,
  Loader2,
  Wand2,
  Layers,
} from "lucide-react";
import type { Order, Rider, Settings } from "@/lib/types";
import { formatMoney, ALL_CLUSTERS, CLUSTER_COLORS, CLUSTER_SHORT, CLUSTER_LABELS } from "@/lib/ui";
import { getAreaCentroid } from "@/lib/area-centroids";

// Lazy-load the maps so this page stays SSR-cheap
const ClientRouteMap = dynamic(() => import("@/components/map/client-route-map"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 380,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-elevated)",
        color: "var(--text-muted)",
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      Loading map…
    </div>
  ),
});
const ClientDhakaClusterMap = dynamic(
  () => import("@/components/map/client-dhaka-cluster-map"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: 460,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-elevated, #1a1a1a)",
          color: "var(--text-muted)",
          borderRadius: 10,
          fontSize: 13,
          border: "1px solid var(--border)",
        }}
      >
        Loading map…
      </div>
    ),
  },
);

interface RidersWithPlansResponse {
  date: string;
  riders: Array<{
    rider: Rider;
    orders: Order[];
    totalDistanceMeters: number;
  }>;
}

interface QuickLocateResult {
  input: string;
  lat: number;
  lng: number;
  source: "photon" | "centroid";
  confidence: number;
  displayName?: string;
  distanceMeters: number;
  straightLineMeters: number;
  estMinutes: number;
  direction: "NW" | "NE" | "SW" | "SE";
  shop: { lat: number; lng: number };
  distanceSource: "osrm" | "haversine";
}

const DIRECTION_COLOR: Record<"NW" | "NE" | "SW" | "SE", string> = {
  NW: "#3b82f6",
  NE: "#16a34a",
  SW: "#ef4444",
  SE: "#f59e0b",
};

const DIRECTION_LABEL: Record<"NW" | "NE" | "SW" | "SE", string> = {
  NW: "North-West",
  NE: "North-East",
  SW: "South-West",
  SE: "South-East",
};

function bdToday(): string {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function distanceLabel(m: number): string {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

export default function RoutesLandingPage() {
  const [date, setDate] = useState<string>(bdToday());
  const [ridersWithPlans, setRidersWithPlans] = useState<RidersWithPlansResponse["riders"]>([]);
  const [allRiders, setAllRiders] = useState<Rider[]>([]);
  const [unassigned, setUnassigned] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Shop pin — sourced from /api/settings (settings page is the editor). Falls
  // back to the canonical Aftabnagar centroid so the cluster map still makes
  // sense before settings load.
  const aftab = getAreaCentroid("Aftabnagar");
  const [shop, setShop] = useState<{ lat: number; lng: number; label: string }>({
    lat: aftab.lat,
    lng: aftab.lng,
    label: "Shop",
  });

  // Quick-locate state
  const [locateQuery, setLocateQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [locateResult, setLocateResult] = useState<QuickLocateResult | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Auto-assign state
  const [autoAssignBusy, setAutoAssignBusy] = useState(false);
  const [autoAssignMsg, setAutoAssignMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, u, r, s] = await Promise.all([
        fetch(`/api/routes?date=${date}`).then((x) => x.json() as Promise<RidersWithPlansResponse>),
        fetch(`/api/routes/unassigned?date=${date}`).then((x) => x.json()),
        fetch(`/api/riders`).then((x) => x.json() as Promise<Rider[]>),
        fetch(`/api/settings`).then((x) => x.json() as Promise<Settings>),
      ]);
      setRidersWithPlans(p.riders ?? []);
      setUnassigned((u.orders as Order[]) ?? []);
      setAllRiders(r ?? []);
      if (s && s.shopLat != null && s.shopLng != null) {
        setShop({
          lat: s.shopLat,
          lng: s.shopLng,
          label: s.businessName?.trim() || "Shop",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const runLocate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!locateQuery.trim()) return;
    setLocating(true);
    setLocateError(null);
    try {
      const res = await fetch("/api/routes/quick-locate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: locateQuery }),
      });
      if (res.status === 404) {
        const data = await res.json();
        setLocateResult(null);
        setLocateError(data?.error ?? "No match found");
        return;
      }
      if (!res.ok) throw new Error("Quick-locate failed");
      const data: QuickLocateResult = await res.json();
      setLocateResult(data);
      setLocateError(null);
    } catch (e) {
      setLocateResult(null);
      setLocateError(String(e));
    } finally {
      setLocating(false);
    }
  };

  // Map stops for the quick-locate map: always the shop + the located pin (if any)
  const mapStops = locateResult
    ? [
        {
          orderId: -1,
          lat: locateResult.lat,
          lng: locateResult.lng,
          label: "★",
          title: locateResult.input,
          color: DIRECTION_COLOR[locateResult.direction],
          body: (
            <div style={{ marginTop: 4, fontSize: 11, color: "#444" }}>
              <div>{locateResult.displayName ?? locateResult.input}</div>
              <div style={{ marginTop: 2 }}>
                <strong style={{ color: DIRECTION_COLOR[locateResult.direction] }}>
                  {distanceLabel(locateResult.distanceMeters)} {locateResult.direction}
                </strong>{" "}
                · {locateResult.estMinutes} min
              </div>
              <div style={{ marginTop: 2, color: "#666", fontSize: 10 }}>
                Source: {locateResult.source} ({Math.round(locateResult.confidence * 100)}% confidence)
              </div>
            </div>
          ),
        },
      ]
    : [];

  const plannedRidersCount = ridersWithPlans.length;
  const totalStops = ridersWithPlans.reduce((s, r) => s + r.orders.length, 0);
  const totalDistance = ridersWithPlans.reduce((s, r) => s + r.totalDistanceMeters, 0);
  const unassignedCount = unassigned.length;
  const unassignedTotal = unassigned.reduce((s, o) => s + o.total, 0);
  const unassignedCOD = unassigned
    .filter((o) => o.paymentMethod === "cod")
    .reduce((s, o) => s + Math.max(0, o.total - o.paid), 0);

  /** Bucket unassigned orders by their cluster so the dispatcher can see the
   *  load distribution at a glance. */
  const unassignedByCluster = (() => {
    const m: Record<string, Order[]> = {};
    for (const c of ALL_CLUSTERS) m[c] = [];
    m["__unassigned__"] = [];
    for (const o of unassigned) {
      const key = o.cluster && m[o.cluster] ? o.cluster : "__unassigned__";
      m[key].push(o);
    }
    return m;
  })();

  const runAutoAssign = async () => {
    setAutoAssignBusy(true);
    setAutoAssignMsg(null);
    try {
      const res = await fetch("/api/routes/auto-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Auto-assign failed");
      const totalAssigned = Object.values<number>(data.byCluster ?? {}).reduce(
        (s: number, n) => s + (n as number),
        0,
      );
      const unassignedByCluster2 = data.unassignedByCluster ?? {};
      const totalLeft = Object.values<number>(unassignedByCluster2).reduce(
        (s: number, n) => s + (n as number),
        0,
      );
      const riderLines = Object.entries<{ name: string; count: number }>(
        data.byRider ?? {},
      )
        .map(([rid, v]) => `${v.name}: ${v.count}`)
        .join(" · ");
      setAutoAssignMsg(
        `Assigned ${totalAssigned} of ${totalAssigned + totalLeft}` +
          (riderLines ? ` → ${riderLines}` : "") +
          (totalLeft > 0 ? ` · ${totalLeft} left (no rider for that cluster)` : ""),
      );
      await load();
    } catch (e) {
      setAutoAssignMsg(`Error: ${e}`);
    } finally {
      setAutoAssignBusy(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Route Planner</h1>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(77,158,71,0.15)",
                color: "var(--accent-green)",
                border: "1px solid rgba(77,158,71,0.4)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
              title="This system is scoped to Dhaka Metro deliveries only"
            >
              <span style={{ width: 6, height: 6, borderRadius: 3, background: "var(--accent-green)" }} />
              Dhaka Metro
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            Plan each rider's visit order. Auto-optimized from the shop.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={14} color="var(--text-secondary)" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ padding: "4px 8px", fontSize: 13 }}
          />
        </div>
      </div>

      {/* Dhaka Cluster Map — operator's mental model: shop + 4 cluster regions. */}
      <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid var(--accent-amber)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Layers size={16} color="var(--accent-amber)" />
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Dhaka Delivery Grid</h2>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Your shop (red pin) and the four operational cluster regions. Click any region to see its description.
          </span>
        </div>
        <ClientDhakaClusterMap shop={shop} height={460} />
      </div>

      {/* Quick Location card — paste an address, see it on the map with
          direction + distance from the shop. */}
      <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid var(--accent-green)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Compass size={16} color="var(--accent-green)" />
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Quick Location Check</h2>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Paste any Dhaka address (English or <span style={{ fontFamily: "serif" }}>বাংলা</span>) — geocoded via OSM, road distance + ETA from your shop.
          </span>
        </div>
        <form onSubmit={runLocate} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search
              size={14}
              style={{ position: "absolute", left: 10, top: 11, color: "var(--text-muted)" }}
            />
            <input
              type="text"
              value={locateQuery}
              onChange={(e) => setLocateQuery(e.target.value)}
              placeholder='e.g. "House 27, Road 4, Dhanmondi" · "Gulshan 2" · "মিরপুর ২, ঢাকা"'
              style={{ width: "100%", padding: "8px 10px 8px 32px", fontSize: 13 }}
              disabled={locating}
            />
          </div>
          <button
            type="submit"
            disabled={locating || !locateQuery.trim()}
            className="btn btn-primary"
            style={{ fontSize: 13, padding: "8px 14px" }}
          >
            {locating ? <Loader2 size={13} className="spin" /> : <Crosshair size={13} />}
            {locating ? " Locating…" : " Locate"}
          </button>
        </form>

        {locateError && (
          <div
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              background: "rgba(220,38,38,0.10)",
              color: "var(--accent-red)",
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            {locateError} — try a more specific address like <code>House 27, Road 4, Dhanmondi, Dhaka</code>.
          </div>
        )}

        {locateResult && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                padding: 10,
                background: "var(--bg-elevated, #1a1a1a)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              <div style={{ color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Result
              </div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>
                {locateResult.displayName ?? locateResult.input}
              </div>
              <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
                    Road distance
                    {locateResult.distanceSource === "osrm" && (
                      <span
                        style={{
                          fontSize: 9,
                          background: "rgba(77,158,71,0.20)",
                          color: "var(--accent-green)",
                          padding: "1px 4px",
                          borderRadius: 3,
                          fontWeight: 700,
                        }}
                        title="From OpenStreetMap road network (matches Google Maps)"
                      >
                        OSM
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, color: DIRECTION_COLOR[locateResult.direction], fontSize: 15 }}>
                    {distanceLabel(locateResult.distanceMeters)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: 10 }}>ETA (driving)</div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{locateResult.estMinutes} min</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: 10 }}>Straight-line</div>
                  <div style={{ fontWeight: 600, color: "var(--text-muted)" }}>
                    {distanceLabel(locateResult.straightLineMeters)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: 10 }}>Direction</div>
                  <div style={{ fontWeight: 700, color: DIRECTION_COLOR[locateResult.direction] }}>
                    {DIRECTION_LABEL[locateResult.direction]} ({locateResult.direction})
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: 10 }}>Geocoder</div>
                  <div style={{ fontWeight: 700 }}>
                    {locateResult.source}{" "}
                    <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                      ({Math.round(locateResult.confidence * 100)}%)
                    </span>
                  </div>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ color: "var(--text-muted)", fontSize: 10 }}>Coords</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {locateResult.lat.toFixed(5)}, {locateResult.lng.toFixed(5)}
                  </div>
                </div>
              </div>
            </div>
            <div
              style={{
                padding: 10,
                background: "var(--bg-elevated, #1a1a1a)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--text-secondary)",
              }}
            >
              <div style={{ color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                How to use
              </div>
              <ul style={{ paddingLeft: 16, margin: "6px 0 0", lineHeight: 1.6 }}>
                <li>Paste a customer address before creating their order to verify the pin location.</li>
                <li>
                  Use this to estimate <strong>{locateResult.estMinutes} min</strong> delivery time from your shop.
                </li>
                <li>
                  For exact doorstep placement, drop a pin on the order detail page (coords override).
                </li>
              </ul>
            </div>
          </div>
        )}

        <ClientRouteMap
          center={locateResult ?? { lat: 23.769, lng: 90.455 }}
          shop={{ lat: 23.769, lng: 90.455 }}
          shopLabel="Shop"
          stops={mapStops}
          drawRoute={Boolean(locateResult)}
          height={380}
          fitBounds
        />
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
          The red pin is your shop. The star pin is the located address, with a route line drawn from the shop.
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <StatCard label="Active plans" value={String(plannedRidersCount)} accent="var(--accent-green)" />
        <StatCard label="Total stops" value={String(totalStops)} accent="var(--accent-green)" />
        <StatCard label="Total route" value={distanceLabel(totalDistance)} accent="var(--accent-green)" />
        <StatCard
          label="Unassigned"
          value={String(unassignedCount)}
          sub={unassignedCount > 0 ? formatMoney(unassignedTotal) : ""}
          accent={unassignedCount > 0 ? "var(--accent-amber)" : "var(--text-muted)"}
        />
      </div>

      {/* Two-column layout: existing plans + rider chooser */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Existing plans */}
        <div className="card" style={{ padding: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <MapPin size={15} color="var(--accent-green)" /> Plans for {date}
          </h2>
          {loading ? (
            <div style={{ color: "var(--text-muted)", fontSize: 12, padding: 8 }}>Loading…</div>
          ) : ridersWithPlans.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 12, padding: 8 }}>
              No plans yet. Pick a rider on the right to start planning.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ridersWithPlans.map((p) => (
                <Link
                  key={p.rider.id}
                  href={`/routes/${p.rider.id}?date=${date}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: "var(--bg-elevated, #1a1a1a)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      background: "var(--accent-green)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Bike size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.rider.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {p.orders.length} stop{p.orders.length !== 1 ? "s" : ""} · {distanceLabel(p.totalDistanceMeters)}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--accent-green)", fontWeight: 600 }}>Open →</div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Start a new plan */}
        <div className="card" style={{ padding: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <Bike size={15} color="var(--accent-green)" /> Start / Edit a plan
          </h2>
          {loading ? (
            <div style={{ color: "var(--text-muted)", fontSize: 12, padding: 8 }}>Loading…</div>
          ) : allRiders.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 12, padding: 8 }}>
              No riders yet. Add riders in the Riders page.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {allRiders.map((r) => {
                const hasPlan = plannedRidersCount && ridersWithPlans.some((x) => x.rider.id === r.id);
                return (
                  <Link
                    key={r.id}
                    href={`/routes/${r.id}?date=${date}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        background: r.status === "active" ? "var(--accent-green)" : "var(--text-muted)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Bike size={13} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {r.vehicle || "—"} · {r.status}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--accent-green)", fontWeight: 600 }}>
                      {hasPlan ? "Edit →" : "Plan →"}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Unassigned pool preview — grouped by cluster + auto-assign button */}
      {unassignedCount > 0 && (
        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
                <Package size={15} color="var(--accent-amber)" /> Unassigned for {date} ({unassignedCount})
              </h2>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {formatMoney(unassignedTotal)} total · {formatMoney(unassignedCOD)} COD ·{" "}
                {formatMoney(unassignedTotal - unassignedCOD)} pre-paid
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {autoAssignMsg && (
                <span
                  style={{
                    fontSize: 12,
                    color: autoAssignMsg.startsWith("Error") ? "var(--accent-red)" : "var(--accent-green)",
                  }}
                >
                  {autoAssignMsg}
                </span>
              )}
              <button
                onClick={runAutoAssign}
                disabled={autoAssignBusy}
                className="btn btn-primary"
                style={{ fontSize: 13 }}
                title="Round-robin assign these unassigned orders to active riders in each cluster"
              >
                {autoAssignBusy ? <Loader2 size={13} className="spin" /> : <Wand2 size={13} />}
                {autoAssignBusy ? " Assigning…" : " Auto-assign by cluster"}
              </button>
            </div>
          </div>

          {/* Per-cluster buckets */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {ALL_CLUSTERS.map((c) => {
              const list = unassignedByCluster[c] ?? [];
              if (list.length === 0) return null;
              const subtotal = list.reduce((s, o) => s + o.total, 0);
              return (
                <div
                  key={c}
                  style={{
                    border: `1px solid ${CLUSTER_COLORS[c]}55`,
                    borderLeft: `3px solid ${CLUSTER_COLORS[c]}`,
                    borderRadius: 6,
                    padding: 10,
                    background: "var(--bg-elevated, #1a1a1a)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 6,
                        color: CLUSTER_COLORS[c],
                        background: `${CLUSTER_COLORS[c]}22`,
                      }}
                    >
                      <Layers size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
                      {CLUSTER_SHORT[c]} · {CLUSTER_LABELS[c].replace(/^DHK-[A-Z]+ — /, "")}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {list.length} · {formatMoney(subtotal)}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 180, overflowY: "auto" }}>
                    {list.map((o) => (
                      <div
                        key={o.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 6px",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          fontSize: 12,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {o.customerName}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                            {o.orderNo} · {o.area} · {o.paymentMethod.toUpperCase()}
                            {o.subCluster ? ` · ${o.subCluster}` : ""}
                          </div>
                        </div>
                        <div style={{ fontWeight: 600 }}>{formatMoney(o.total)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {/* Bucket for orders without a cluster (legacy / area not in master) */}
            {(unassignedByCluster["__unassigned__"] ?? []).length > 0 && (
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderLeft: "3px solid var(--text-muted)",
                  borderRadius: 6,
                  padding: 10,
                  background: "var(--bg-elevated, #1a1a1a)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>
                    Unrecognised area
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {unassignedByCluster["__unassigned__"].length}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Auto-assign will skip these. Edit each order's area to assign a cluster.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CSS for spinner */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  accent: string;
}) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}