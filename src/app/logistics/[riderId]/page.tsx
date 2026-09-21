"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bike, MapPin, Clock, Plus, Trash2, Printer, Sparkles, Save, X } from "lucide-react";
import type { Order, Rider, Settings } from "@/lib/types";
import { formatMoney } from "@/lib/ui";
import ClientRouteMap, { type ClientRouteMapProps } from "@/components/map/client-route-map";

interface PlanLeg {
  fromOrderId: number | null;
  toOrderId: number;
  distanceMeters: number;
  estSeconds: number;
}

interface PlanApiResponse {
  riderId: number;
  date: string;
  shop: { lat: number; lng: number };
  orders: Order[];
}

interface OptimizeResponse {
  riderId: number;
  date: string;
  updated: number;
  unassigned: number;
  sequence: number[];
  totalDistanceMeters: number;
  totalEstSeconds: number;
  legs: PlanLeg[];
}

function bdToday(): string {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function distanceLabel(m: number): string {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}
function etaLabel(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

export default function RiderPlanPage({
  params,
}: {
  params: Promise<{ riderId: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [riderId, setRiderId] = useState<number | null>(null);
  const [date, setDate] = useState<string>(bdToday());
  const [rider, setRider] = useState<Rider | null>(null);
  const [shop, setShop] = useState<{ lat: number; lng: number } | null>(null);
  const [planned, setPlanned] = useState<Order[]>([]);
  const [unassigned, setUnassigned] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [selectedUnassigned, setSelectedUnassigned] = useState<Set<number>>(new Set());

  // Local working copy of the plan sequence (orderIds). User can drag to reorder.
  const [workingSequence, setWorkingSequence] = useState<number[]>([]);
  const [seededFromQuery, setSeededFromQuery] = useState(false);
  // Map of orderId → live leg from latest optimization (for distance/ETA in the side list).
  const [legs, setLegs] = useState<Map<number, { distanceMeters: number; estSeconds: number }>>(
    new Map(),
  );
  const [totalDistance, setTotalDistance] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  // Drag state
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  // Resolve params + initial date from query
  useEffect(() => {
    (async () => {
      const { riderId: idParam } = await params;
      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        router.push("/routes");
        return;
      }
      setRiderId(id);
      const d = searchParams?.get("date");
      if (d) setDate(d);
      setSeededFromQuery(false); // re-seed on rider/date change
    })();
  }, [params, router, searchParams]);

  // Load data when riderId/date changes
  const load = useCallback(async () => {
    if (riderId === null) return;
    setLoading(true);
    try {
      const [planRes, unassignedRes, ridersRes, settingsRes] = await Promise.all([
        fetch(`/api/routes/${riderId}?date=${date}`).then((r) => r.json()),
        fetch(`/api/routes/unassigned?date=${date}`).then((r) => r.json()),
        fetch(`/api/riders`).then((r) => r.json()),
        fetch(`/api/settings`).then((r) => r.json() as Promise<Settings>),
      ]);
      const plan: PlanApiResponse = planRes;
      setRider(((ridersRes as Rider[]) ?? []).find((x) => x.id === riderId) ?? null);
      setShop(plan.shop);
      setPlanned(plan.orders);
      setUnassigned((unassignedRes.orders as Order[]) ?? []);
      const existingSequence = (plan.orders as Order[])
        .filter((o) => o.riderSeq != null)
        .sort((a, b) => (a.riderSeq ?? 0) - (b.riderSeq ?? 0))
        .map((o) => o.id);
      setSelectedUnassigned(new Set());
      setMessage(null);

      // If the caller passed selectedIds in the query, seed the working
      // sequence with those (in addition to any already-planned orders).
      // We only do this on the first load for a given riderId+date so
      // a manual re-load (e.g., after save) doesn't keep re-seeding.
      if (!seededFromQuery) {
        const rawIds = searchParams?.get("selectedIds");
        if (rawIds) {
          const wanted = rawIds
            .split(",")
            .map((s) => Number(s))
            .filter((n) => Number.isFinite(n));
          // Validate against the unassigned pool so we don't seed with bad IDs.
          const unassignedIds = new Set(((unassignedRes.orders as Order[]) ?? []).map((o) => o.id));
          const valid = wanted.filter((id) => unassignedIds.has(id));
          setWorkingSequence([...existingSequence, ...valid]);
          setSeededFromQuery(true);
          if (valid.length > 0) {
            setMessage({
              kind: "ok",
              text: `Added ${valid.length} order${valid.length !== 1 ? "s" : ""} from the orders page. Click Optimize or Save.`,
            });
          }
        } else {
          setWorkingSequence(existingSequence);
          setSeededFromQuery(true);
        }
      }
    } catch (e) {
      setMessage({ kind: "err", text: `Load failed: ${String(e)}` });
    } finally {
      setLoading(false);
    }
  }, [riderId, date, searchParams, seededFromQuery]);

  useEffect(() => {
    load();
  }, [load]);

  // All hooks must run unconditionally — moved above the early returns.
  const allOrders = useMemo(() => {
    const m = new Map<number, Order>();
    for (const o of planned) m.set(o.id, o);
    for (const o of unassigned) m.set(o.id, o);
    return m;
  }, [planned, unassigned]);

  const mapStops: ClientRouteMapProps["stops"] = useMemo(
    () =>
      workingSequence
        .map((id, idx) => {
          const o = allOrders.get(id);
          if (!o || typeof o.lat !== "number" || typeof o.lng !== "number") return null;
          const leg = legs.get(id);
          return {
            orderId: o.id,
            lat: o.lat,
            lng: o.lng,
            label: String(idx + 1),
            title: `${idx + 1}. ${o.orderNo} — ${o.customerName}`,
            body: (
              <div style={{ marginTop: 4, fontSize: 11, color: "#444" }}>
                <div>{o.area}{o.address ? ` — ${o.address}` : ""}</div>
                <div style={{ marginTop: 2 }}>{formatMoney(o.total)} · {o.customerPhone}</div>
                {leg && (
                  <div style={{ marginTop: 2, color: "var(--color-success)", fontWeight: 600 }}>
                    {distanceLabel(leg.distanceMeters)} · {etaLabel(leg.estSeconds)}
                  </div>
                )}
              </div>
            ),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    // legs intentionally omitted: we don't want a fresh stops array every
    // recompute — the icon labels are stable, and the body recomputes cheaply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workingSequence, allOrders, shop?.lat, shop?.lng],
  );

  // Early returns AFTER all hooks have been declared (rules of hooks).
  if (loading || riderId === null) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>;
  }
  if (!rider) {
    return <div style={{ padding: 40, textAlign: "center" }}>Rider not found.</div>;
  }

  const toggleSelect = (id: number) => {
    setSelectedUnassigned((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const addSelectedToPlan = () => {
    if (selectedUnassigned.size === 0) return;
    setWorkingSequence((prev) => [...prev, ...Array.from(selectedUnassigned)]);
    setSelectedUnassigned(new Set());
  };

  const removeFromPlan = (id: number) => {
    setWorkingSequence((prev) => prev.filter((x) => x !== id));
  };

  const autoOptimize = async () => {
    if (workingSequence.length < 2) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/routes/${riderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, orderIds: workingSequence, autoOptimize: true }),
      });
      const data: OptimizeResponse = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Optimize failed");
      setWorkingSequence(data.sequence);
      setMessage({ kind: "ok", text: `Optimized: ${distanceLabel(data.totalDistanceMeters)}, ETA ${etaLabel(data.totalEstSeconds)}` });
    } catch (e) {
      setMessage({ kind: "err", text: String(e) });
    }
  };

  const savePlan = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/routes/${riderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, orderIds: workingSequence, autoOptimize: false }),
      });
      const data: OptimizeResponse = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Save failed");
      setMessage({ kind: "ok", text: `Saved ${data.updated} stops` });
      await load();
    } catch (e) {
      setMessage({ kind: "err", text: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const clearPlan = async () => {
    if (!confirm("Clear all stops from this rider's plan?")) return;
    setClearing(true);
    try {
      await fetch(`/api/routes/${riderId}`, { method: "DELETE" });
      setWorkingSequence([]);
      setMessage({ kind: "ok", text: "Plan cleared" });
      await load();
    } catch (e) {
      setMessage({ kind: "err", text: String(e) });
    } finally {
      setClearing(false);
    }
  };

  // Drag handlers
  const onDragStart = (id: number) => (e: React.DragEvent) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (id: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  };
  const onDrop = (id: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (draggingId == null || draggingId === id) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    setWorkingSequence((prev) => {
      const next = prev.slice();
      const fromIdx = next.indexOf(draggingId);
      const toIdx = next.indexOf(id);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setDraggingId(null);
    setDragOverId(null);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Link href="/routes" style={{ textDecoration: "none", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
            <Bike size={16} /> ← Routes
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{rider.name}</h1>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{rider.phone}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: 999,
              background: "color-mix(in srgb, var(--color-brand) 15%, transparent)",
              color: "var(--accent-green)",
              border: "1px solid color-mix(in srgb, var(--color-brand) 40%, transparent)",
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ padding: "4px 8px", fontSize: 13 }}
          />
          <Link
            href={`/routes/${riderId}/print?date=${date}`}
            target="_blank"
            className="btn btn-secondary"
            style={{ fontSize: 12, textDecoration: "none" }}
          >
            <Printer size={13} /> Print
          </Link>
        </div>
      </div>

      {message && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            marginBottom: 12,
            background: message.kind === "ok" ? "var(--tint-brand-12)" : "var(--tint-danger-12)",
            color: message.kind === "ok" ? "var(--accent-green)" : "var(--accent-red)",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {message.text}
        </div>
      )}

      {/* Two-column layout: side lists + map */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(360px, 420px) 1fr",
          gap: 12,
          alignItems: "start",
        }}
      >
        {/* LEFT: lists */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Current plan */}
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <MapPin size={14} color="var(--accent-green)" /> Route plan ({workingSequence.length} stops)
              </h2>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  className="btn btn-secondary"
                  onClick={autoOptimize}
                  disabled={workingSequence.length < 2}
                  style={{ fontSize: 11, padding: "4px 8px" }}
                  title="Auto-optimize using nearest-neighbor + 2-opt"
                >
                  <Sparkles size={12} /> Optimize
                </button>
                <button
                  className="btn btn-primary"
                  onClick={savePlan}
                  disabled={saving}
                  style={{ fontSize: 11, padding: "4px 8px" }}
                >
                  <Save size={12} /> {saving ? "Saving…" : "Save"}
                </button>
                <button
                  className="btn btn-danger"
                  onClick={clearPlan}
                  disabled={clearing}
                  style={{ fontSize: 11, padding: "4px 8px" }}
                  title="Clear all stops from this rider's plan"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {workingSequence.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "12px 0", textAlign: "center" }}>
                No stops yet. Select orders from below and click Add.
              </div>
            ) : (
              <>
                <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                  {workingSequence.map((id, idx) => {
                    const o = allOrders.get(id);
                    if (!o) return null;
                    const leg = legs.get(id);
                    return (
                      <div
                        key={id}
                        draggable
                        onDragStart={onDragStart(id)}
                        onDragOver={onDragOver(id)}
                        onDrop={onDrop(id)}
                        onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 8px",
                          background: dragOverId === id ? "var(--tint-brand-12)" : "var(--bg-elevated, #1a1a1a)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          cursor: "grab",
                          opacity: draggingId === id ? 0.4 : 1,
                          transition: "background 0.1s",
                        }}
                      >
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            background: "var(--accent-green)",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 800,
                            flexShrink: 0,
                          }}
                        >
                          {idx + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {o.customerName}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {o.orderNo} · {o.area}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          {leg && (
                            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                              {distanceLabel(leg.distanceMeters)} · {etaLabel(leg.estSeconds)}
                            </div>
                          )}
                          <div style={{ fontSize: 11, fontWeight: 600 }}>{formatMoney(o.total)}</div>
                        </div>
                        <button
                          onClick={() => removeFromPlan(id)}
                          style={{
                            background: "transparent",
                            border: 0,
                            cursor: "pointer",
                            color: "var(--text-muted)",
                            padding: 2,
                            display: "flex",
                          }}
                          title="Remove from plan"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 10,
                    padding: "8px 10px",
                    background: "var(--bg-elevated, #1a1a1a)",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <MapPin size={12} /> {distanceLabel(totalDistance)}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={12} /> {etaLabel(totalSeconds)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Unassigned pool */}
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
                Unassigned today ({unassigned.length})
              </h2>
              <button
                className="btn btn-primary"
                onClick={addSelectedToPlan}
                disabled={selectedUnassigned.size === 0}
                style={{ fontSize: 11, padding: "4px 8px" }}
              >
                <Plus size={12} /> Add ({selectedUnassigned.size})
              </button>
            </div>
            {unassigned.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "8px 0", textAlign: "center" }}>
                Nothing unassigned.
              </div>
            ) : (
              <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                {unassigned.map((o) => {
                  const checked = selectedUnassigned.has(o.id);
                  // Inline haversine from shop (lat/lng already set from area centroid)
                  let distLabel = "—";
                  if (typeof o.lat === "number" && typeof o.lng === "number" && shop) {
                    const R = 6371000;
                    const toRad = (d: number) => (d * Math.PI) / 180;
                    const dLat = toRad(o.lat - shop.lat);
                    const dLng = toRad(o.lng - shop.lng);
                    const a =
                      Math.sin(dLat / 2) ** 2 +
                      Math.cos(toRad(shop.lat)) * Math.cos(toRad(o.lat)) * Math.sin(dLng / 2) ** 2;
                    const m = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
                    distLabel = m < 1000 ? `${m} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
                  }
                  return (
                    <label
                      key={o.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "5px 8px",
                        background: checked ? "var(--tint-brand-12)" : "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: 5,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(o.id)}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {o.customerName}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {o.orderNo} · {o.area}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600 }}>{formatMoney(o.total)}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {distLabel} from shop
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: map */}
        <div>
          {shop ? (
            <>
              <div
                style={{
                  marginBottom: 8,
                  padding: "8px 10px",
                  background: "var(--bg-elevated, #1a1a1a)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 0, color: "var(--text-secondary)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Shop (pinned):</strong>{" "}
                  <span style={{ fontFamily: "monospace" }}>
                    {shop.lat.toFixed(5)}, {shop.lng.toFixed(5)}
                  </span>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    Shop location is locked. To update it, go to{" "}
                    <Link href="/settings" style={{ color: "var(--accent-green)", textDecoration: "underline" }}>
                      Settings → Shop Location
                    </Link>
                    .
                  </div>
                </div>
              </div>
              <ClientRouteMap
                center={shop}
                shop={shop}
                shopLabel="Shop"
                stops={mapStops}
                drawRoute
                height={620}
                fitBounds
              />
            </>
          ) : (
            <div style={{ height: 620, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-elevated, #1a1a1a)", borderRadius: 8, color: "var(--text-muted)" }}>
              Set shop location in Settings to enable the map.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
