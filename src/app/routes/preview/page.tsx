"use client";

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Map, ArrowLeft, Calendar, Truck, Compass } from "lucide-react";
import type { Order } from "@/lib/types";
import { formatMoney } from "@/lib/ui";

const ClientRouteMap = dynamic(() => import("@/components/map/client-route-map"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 560, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-elevated)", color: "var(--text-muted)", borderRadius: 8, fontSize: 13 }}>
  Loading map…
  </div>
  ),
});

interface DirectionItem {
  order: Order;
  distanceMeters: number;
  estMinutes: number;
  direction: "NW" | "NE" | "SW" | "SE";
  centerQuadrant: "NW" | "NE" | "SW" | "SE";
}

interface PreviewResponse {
  date: string;
  shop: { lat: number; lng: number };
  counts: { total: number; withCoords: number; withoutCoords: number };
  groups: Record<"NW" | "NE" | "SW" | "SE", DirectionItem[]>;
  summary: Array<{
    direction: "NW" | "NE" | "SW" | "SE";
    count: number;
    totalDistanceMeters: number;
    avgDistanceMeters: number;
    nearestOrderId: number | null;
    nearestDistanceMeters: number;
  }>;
  skippedDateMismatch: number;
}

const DIRECTION_LABEL: Record<"NW" | "NE" | "SW" | "SE", string> = {
  NW: "North-West",
  NE: "North-East",
  SW: "South-West",
  SE: "South-East",
};

const DIRECTION_COLOR: Record<"NW" | "NE" | "SW" | "SE", string> = {
  // Cool colors for north, warm for south; West/East shaded via saturation.
  NW: "#3b82f6", // blue
  NE: "#16a34a", // green
  SW: "#ef4444", // red
  SE: "#f59e0b", // amber
};

function distanceLabel(m: number): string {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

function bdToday(): string {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function RoutePreviewContent() {
  const search = useSearchParams();
  const date = search?.get("date") || bdToday();
  const selectedIds = search?.get("selectedIds") || "";

  const [data, setData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ date });
      if (selectedIds) qs.set("selectedIds", selectedIds);
      const res = await fetch(`/api/routes/preview?${qs.toString()}`);
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [date, selectedIds]);

  useEffect(() => {
    load();
  }, [load]);

  // Map stops: each order gets a colored pin by its direction. We don't
  // draw a route polyline because there's no assigned sequence — just the
  // pins, plus the red shop origin.
  const mapStops = useMemo(() => {
    if (!data) return [];
    const out: Array<{
      orderId: number;
      lat: number;
      lng: number;
      label: string;
      title: string;
      body: React.ReactNode;
      color: string;
    }> = [];
    for (const dir of ["NW", "NE", "SW", "SE"] as const) {
      const list = data.groups[dir];
      list.forEach((it, idx) => {
        out.push({
          orderId: it.order.id,
          lat: it.order.lat!,
          lng: it.order.lng!,
          label: `${DIRECTION_LABEL[dir].split("-")[0][0]}${idx + 1}`,
          title: `${dir} #${idx + 1} · ${it.order.customerName}`,
          body: (
            <div style={{ marginTop: 4, fontSize: 11, color: "#444" }}>
              <div>{it.order.area}{it.order.address ? ` — ${it.order.address}` : ""}</div>
              <div style={{ marginTop: 2 }}>{formatMoney(it.order.total)} · {it.order.customerPhone}</div>
              <div style={{ marginTop: 2, color: DIRECTION_COLOR[dir], fontWeight: 600 }}>
                {distanceLabel(it.distanceMeters)} {dir} · {it.estMinutes} min
              </div>
            </div>
          ),
          color: DIRECTION_COLOR[dir],
        });
      });
    }
    return out;
  }, [data]);

  if (loading || !data) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        Loading direction preview…
      </div>
    );
  }

  const totalDistance = data.summary.reduce((s, x) => s + x.totalDistanceMeters, 0);
  const totalOrders = data.counts.total;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Link href="/routes" style={{ textDecoration: "none", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
            <ArrowLeft size={16} /> ← Routes
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Compass size={20} color="var(--accent-green)" /> Direction Preview
          </h1>
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
            }}
          >
            Dhaka Metro
          </span>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {selectedIds ? "Selected orders" : "All today"} ·{" "}
            <strong style={{ color: "var(--text-primary)" }}>{totalOrders} order{totalOrders !== 1 ? "s" : ""}</strong>
            {" · "}{distanceLabel(totalDistance)} total
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={14} color="var(--text-secondary)" />
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{date}</span>
        </div>
      </div>

      {/* Direction breakdown — always visible, shows the count per quadrant */}
      {totalOrders > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 12,
            padding: "8px 10px",
            background: "var(--bg-elevated, #1a1a1a)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--text-secondary)",
            flexWrap: "wrap",
          }}
        >
          <strong style={{ color: "var(--text-primary)" }}>Distribution:</strong>
          {(["NW", "NE", "SW", "SE"] as const).map((dir) => (
            <span
              key={dir}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${DIRECTION_COLOR[dir]}40`,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 4, background: DIRECTION_COLOR[dir] }} />
              <strong style={{ color: DIRECTION_COLOR[dir] }}>{data.groups[dir].length}</strong>
              <span>{dir}</span>
            </span>
          ))}
        </div>
      )}

      {/* Quadrant summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
        {data.summary.map((s) => (
          <div key={s.direction} className="card" style={{ padding: 12, borderLeft: `4px solid ${DIRECTION_COLOR[s.direction]}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {DIRECTION_LABEL[s.direction]} ({s.direction})
              </div>
              <Compass size={14} color={DIRECTION_COLOR[s.direction]} />
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: DIRECTION_COLOR[s.direction], lineHeight: 1, marginTop: 4 }}>
              {s.count}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              {s.count === 0 ? (
                "—"
              ) : (
                <>
                  {distanceLabel(s.avgDistanceMeters)} avg · {distanceLabel(s.nearestDistanceMeters)} nearest
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Two-column: side lists + map */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 420px) 1fr", gap: 12, alignItems: "start" }}>
        {/* LEFT: lists by direction */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(["NE", "NW", "SE", "SW"] as const).map((dir) => {
            const list = data.groups[dir];
            return (
              <div key={dir} className="card" style={{ padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: DIRECTION_COLOR[dir] }} />
                    {DIRECTION_LABEL[dir]} ({dir})
                  </h3>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{list.length} stop{list.length !== 1 ? "s" : ""}</span>
                </div>
                {list.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "6px 0" }}>— no orders —</div>
                ) : (
                  <div style={{ maxHeight: 520, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                    {list.map((it) => (
                      <div
                        key={it.order.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 8px",
                          background: "var(--bg-elevated, #1a1a1a)",
                          border: "1px solid var(--border)",
                          borderRadius: 5,
                          fontSize: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            background: DIRECTION_COLOR[dir],
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {dir[0]}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {it.order.customerName}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {it.order.orderNo} · {it.order.area}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, fontSize: 11 }}>
                          <div style={{ fontWeight: 600 }}>{formatMoney(it.order.total)}</div>
                          <div style={{ color: "var(--text-muted)" }}>{distanceLabel(it.distanceMeters)} · {it.estMinutes}m</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {data.counts.withoutCoords > 0 && (
            <div className="card" style={{ padding: 12, borderLeft: "3px solid var(--accent-amber)" }}>
              <div style={{ fontSize: 12, color: "var(--accent-amber)", fontWeight: 700 }}>
                {data.counts.withoutCoords} order{data.counts.withoutCoords !== 1 ? "s" : ""} without coordinates
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                These couldn't be routed. Likely an unrecognized area — verify in the order form.
              </div>
            </div>
          )}
          {data.skippedDateMismatch > 0 && (
            <div className="card" style={{ padding: 12, borderLeft: "3px solid var(--accent-amber)" }}>
              <div style={{ fontSize: 12, color: "var(--accent-amber)", fontWeight: 700 }}>
                {data.skippedDateMismatch} order{data.skippedDateMismatch !== 1 ? "s" : ""} on a different date
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                You're previewing {date}, but the selected orders belong to other dates. Showing them anyway so you can see their direction. The actual plan will save against the order's own date.
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: map */}
        <div>
          <ClientRouteMap
            center={data.shop}
            shop={data.shop}
            shopLabel="Shop"
            stops={mapStops}
            drawRoute={false}
            height={620}
            fitBounds
          />
          <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: "#3b82f6" }} /> NW
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: "#16a34a" }} /> NE
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: "#f59e0b" }} /> SE
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: "#ef4444" }} /> SW
            </span>
            <span style={{ marginLeft: "auto" }}>
              <Truck size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
              Shop (red pin, top-center) is your pinned delivery origin.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Next.js 16 requires `useSearchParams()` to be inside a Suspense boundary.
// Wrapping the content in a Suspense fallback prevents the page from deopting
// to CSR and ensures the search params are picked up on the first render.
export default function RoutePreviewPageWrapper() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          Loading direction preview…
        </div>
      }
    >
      <RoutePreviewContent />
    </Suspense>
  );
}