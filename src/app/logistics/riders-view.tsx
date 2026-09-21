"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Plus, Bike, Banknote, TrendingUp, Truck, Edit3, ListOrdered, Trash2, AlertTriangle } from "lucide-react";
import type { Rider, Order } from "@/lib/types";
import { formatMoney, CLUSTER_LABELS, CLUSTER_SHORT, CLUSTER_COLORS, ALL_CLUSTERS } from "@/lib/ui";
import { ExportMenu, type ExportColumn } from "@/components/export-menu";
import { RiderOrdersModal } from "@/components/rider/rider-orders-modal";

interface RiderStats {
  deliveredCount: number; // own-rider delivered orders only
  totalCount: number;     // total own-rider orders assigned (excludes Pathao)
  pendingCount: number;    // active own-rider loads
  deliveredRevenue: number;
  totalRiderCost: number;  // total payout to this rider for delivered orders
}

export default function RidersPage() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editRider, setEditRider] = useState<Rider | null>(null);
  const [ordersModalRider, setOrdersModalRider] = useState<Rider | null>(null);
  const [deleteRider, setDeleteRider] = useState<Rider | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [r, o] = await Promise.all([
        fetch("/api/riders").then((r) => r.json()),
        fetch("/api/orders").then((r) => r.json()),
      ]);
      setRiders(r);
      setOrders(o);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const statsFor = (riderId: number): RiderStats => {
    // Only count orders dispatched via OUR own rider — exclude Pathao entirely.
    const own = orders.filter((o) => o.riderId === riderId && o.deliveryMode !== "pathao");
    const delivered = own.filter((o) => o.status === "delivered");
    const pending = own.filter((o) => !["delivered", "cancelled"].includes(o.status));
    const deliveredRevenue = delivered.reduce((s, o) => s + o.total, 0);
    const totalRiderCost = delivered.reduce((s, o) => s + (o.riderCost || 0), 0);
    return {
      deliveredCount: delivered.length,
      totalCount: own.length,
      pendingCount: pending.length,
      deliveredRevenue,
      totalRiderCost,
    };
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Loading...</div>;
  }

  // Aggregate totals across all riders
  const totals = riders.reduce(
    (acc, r) => {
      const s = statsFor(r.id);
      acc.delivered += s.deliveredCount;
      acc.pending += s.pendingCount;
      acc.revenue += s.deliveredRevenue;
      acc.riderCost += s.totalRiderCost;
      return acc;
    },
    { delivered: 0, pending: 0, revenue: 0, riderCost: 0 }
  );

  const riderExportCols: ExportColumn<Rider>[] = [
    { header: "Name", get: (r) => r.name },
    { header: "Phone", get: (r) => r.phone },
    { header: "Vehicle", get: (r) => r.vehicle },
    { header: "Status", get: (r) => r.status },
    { header: "Home Cluster", get: (r) => r.homeCluster ?? "" },
    { header: "Also Covers", get: (r) => (r.subClusters ?? []).join(", ") },
    { header: "Max Stops", get: (r) => r.maxStops ?? "" },
    { header: "Delivered", get: (r) => statsFor(r.id).deliveredCount },
    { header: "Pending", get: (r) => statsFor(r.id).pendingCount },
    { header: "Total Orders", get: (r) => statsFor(r.id).totalCount },
    { header: "Delivered Revenue (BDT)", get: (r) => statsFor(r.id).deliveredRevenue },
    { header: "Rider Payout (BDT)", get: (r) => statsFor(r.id).totalRiderCost },
  ];

  // Pathao stats — separate from own-rider stats
  const pathaoOrders = orders.filter((o) => o.deliveryMode === "pathao");
  const pathaoStats = {
    total: pathaoOrders.length,
    delivered: pathaoOrders.filter((o) => o.status === "delivered").length,
    pending: pathaoOrders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length,
    deliveredRevenue: pathaoOrders
      .filter((o) => o.status === "delivered")
      .reduce((s, o) => s + o.total, 0),
    pathaoCost: pathaoOrders.reduce((s, o) => s + (o.pathaoFare || 0), 0),
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Delivery Riders</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <ExportMenu
            rows={riders}
            cols={riderExportCols}
            filename="riders"
            title="Delivery Riders"
            subtitle="performance summary"
            orientation="landscape"
            label="Export"
          />
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Add Rider
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Total Delivered</span>
            <TrendingUp size={16} color="var(--accent-green)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{totals.delivered}</div>
        </div>
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Pending Now</span>
            <Bike size={16} color="var(--accent-amber)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{totals.pending}</div>
        </div>
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Delivered Revenue</span>
            <Banknote size={16} color="var(--accent-green)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(totals.revenue)}</div>
        </div>
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Rider Payout (own)</span>
            <Banknote size={16} color="var(--accent-red)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--accent-red)" }}>
            {formatMoney(totals.riderCost)}
          </div>
        </div>
      </div>

      {/* Own riders first */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12, marginBottom: 16 }}>
        {riders.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No riders yet. Add your first rider.</p>
        )}
        {riders.map((r) => {
          const s = statsFor(r.id);
          return (
            <div key={r.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 50,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(59,130,246,0.15)",
                      color: "var(--accent-blue)",
                    }}
                  >
                    <Bike size={18} />
                  </div>
                  <div>
                    <Link
                      href={`/riders/${r.id}`}
                      style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", textDecoration: "none" }}
                      title="Open rider detail page"
                    >
                      {r.name}
                    </Link>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.vehicle}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select
                    value={r.status}
                    onChange={async (e) => {
                      await fetch(`/api/riders/${r.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: e.target.value }),
                      });
                      load();
                    }}
                    style={{ width: "auto", fontSize: 12, padding: "4px 8px" }}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 11, padding: "4px 8px" }}
                    onClick={() => setOrdersModalRider(r)}
                    title="Quick view of this rider's orders"
                  >
                    <ListOrdered size={12} /> View Orders
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, padding: "4px 8px" }}
                    onClick={() => setEditRider(r)}
                    title="Edit rider"
                  >
                    <Edit3 size={12} /> Edit
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      color: "var(--color-danger, #c4434b)",
                      borderColor: "var(--color-danger, #c4434b)",
                    }}
                    onClick={() => setDeleteRider(r)}
                    title="Delete rider (irreversible)"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>

              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>{r.phone}</div>

              {/* Cluster assignment badge */}
              {r.homeCluster ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  <span
                    title={CLUSTER_LABELS[r.homeCluster]}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 6,
                      color: CLUSTER_COLORS[r.homeCluster],
                      background: `${CLUSTER_COLORS[r.homeCluster]}22`,
                      border: `1px solid ${CLUSTER_COLORS[r.homeCluster]}55`,
                    }}
                  >
                    {CLUSTER_SHORT[r.homeCluster]}
                  </span>
                  {(r.subClusters ?? []).map((c) => (
                    <span
                      key={c}
                      title={`Also covers ${CLUSTER_LABELS[c]}`}
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        color: "var(--text-muted)",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      + {c}
                    </span>
                  ))}
                  {r.maxStops != null && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        color: "var(--text-muted)",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border)",
                      }}
                      title="Soft cap on stops per shift"
                    >
                      cap {r.maxStops}/shift
                    </span>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                    marginBottom: 10,
                  }}
                >
                  No cluster assigned — won't auto-receive orders
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 8,
                  borderTop: "1px solid var(--border)",
                  paddingTop: 10,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Delivered</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--accent-green)" }}>
                    {s.deliveredCount}
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400, marginLeft: 4 }}>
                      / {s.totalCount} orders
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Active loads</div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: s.pendingCount > 0 ? "var(--accent-amber)" : "var(--text-muted)",
                    }}
                  >
                    {s.pendingCount}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Delivered revenue</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{formatMoney(s.deliveredRevenue)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Rider payout</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: s.totalRiderCost > 0 ? "var(--accent-red)" : "var(--text-muted)" }}>
                    {formatMoney(s.totalRiderCost)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pathao (external delivery) section — below own riders */}
      <div
        className="card"
        style={{
          padding: 16,
          marginBottom: 16,
          borderLeft: "3px solid var(--accent-amber)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 50,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--tint-warning-18)",
                color: "var(--accent-amber)",
              }}
            >
              <Truck size={16} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Hired Pathao Riders</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Orders dispatched via Pathao (not counted under any own rider)
              </div>
            </div>
          </div>
          <span
            className="status-badge status-confirmed"
            style={{ background: "var(--tint-warning-18)", color: "var(--accent-amber)", border: "1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)" }}
          >
            External
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Total Pathao Orders</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-amber)" }}>
              {pathaoStats.total}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Delivered</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-green)" }}>
              {pathaoStats.delivered}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Pending</div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: pathaoStats.pending > 0 ? "var(--accent-amber)" : "var(--text-muted)",
              }}
            >
              {pathaoStats.pending}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Revenue (delivered)</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {formatMoney(pathaoStats.deliveredRevenue)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Total Pathao Cost</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-red)" }}>
              {formatMoney(pathaoStats.pathaoCost)}
            </div>
          </div>
        </div>

        {/* Pathao order list (compact) */}
        {pathaoOrders.length > 0 && (
          <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Tracking</th>
                  <th>Status</th>
                  <th>Pathao Fare</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {pathaoOrders
                  .slice()
                  .sort((a, b) => b.total - a.total)
                  .slice(0, 10)
                  .map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600, color: "var(--accent-amber)" }}>{o.orderNo}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{o.customerName}</td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {o.pathaoTrackingId || "—"}
                      </td>
                      <td>
                        <span
                          className={`status-badge status-${o.status === "delivered" ? "delivered" : "confirmed"}`}
                          style={{ fontSize: 11 }}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td>{formatMoney(o.pathaoFare || 0)}</td>
                      <td style={{ fontWeight: 600 }}>{formatMoney(o.total)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {pathaoOrders.length > 10 && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 6 }}>
                Showing 10 of {pathaoOrders.length} Pathao orders
              </p>
            )}
          </div>
        )}
      </div>


      {showAdd && <AddRiderModal onClose={() => setShowAdd(false)} onSaved={load} />}
      {editRider && <EditRiderModal rider={editRider} onClose={() => setEditRider(null)} onSaved={load} />}
      {ordersModalRider && (
        <RiderOrdersModal
          rider={ordersModalRider}
          orders={orders}
          onClose={() => setOrdersModalRider(null)}
        />
      )}
      {deleteRider && (
        <DeleteRiderModal
          rider={deleteRider}
          orders={orders}
          onClose={() => setDeleteRider(null)}
          onDeleted={load}
        />
      )}
    </div>
  );
}

function AddRiderModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    vehicle: "Motorbike",
    status: "active" as "active" | "inactive",
    homeCluster: "" as "" | Rider["homeCluster"],
    subClusters: [] as Rider["subClusters"],
    maxStops: "" as string,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleSub = (c: NonNullable<Rider["homeCluster"]>) => {
    setForm((f) => ({
      ...f,
      subClusters: f.subClusters.includes(c)
        ? f.subClusters.filter((x) => x !== c)
        : [...f.subClusters, c],
    }));
  };

  const submit = async () => {
    setError("");
    if (!form.name.trim()) {
      setError("Rider name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        homeCluster: form.homeCluster || null,
        subClusters: form.subClusters.filter((c) => c && c !== form.homeCluster),
        maxStops: form.maxStops.trim() === "" ? null : Number(form.maxStops),
      };
      const res = await fetch("/api/riders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 16px" }}>Add Rider</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label>Vehicle</label>
            <select value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })}>
              <option value="Motorbike">Motorbike</option>
              <option value="Bicycle">Bicycle</option>
              <option value="Van">Van</option>
              <option value="Car">Car</option>
            </select>
          </div>
          <div><label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "inactive" })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label>Home Cluster</label>
            <select
              value={form.homeCluster ?? ""}
              onChange={(e) => setForm({ ...form, homeCluster: (e.target.value || null) as typeof form.homeCluster })}
              title="Primary cluster — auto-assign will prioritise this rider for orders in this cluster"
            >
              <option value="">— Unassigned —</option>
              {ALL_CLUSTERS.map((c) => (
                <option key={c} value={c}>{CLUSTER_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Max Stops / Shift</label>
            <input
              type="number"
              min="0"
              placeholder="No cap"
              value={form.maxStops}
              onChange={(e) => setForm({ ...form, maxStops: e.target.value })}
              title="Optional soft cap. 0 or empty = no cap."
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", marginBottom: 6 }}>Also Covers (secondary clusters)</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ALL_CLUSTERS.map((c) => (
              <label
                key={c}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 6,
                  background: form.subClusters.includes(c)
                    ? `${CLUSTER_COLORS[c]}22`
                    : "var(--bg-primary)",
                  border: `1px solid ${form.subClusters.includes(c) ? CLUSTER_COLORS[c] : "var(--border)"}`,
                  cursor: "pointer",
                  color: form.subClusters.includes(c) ? CLUSTER_COLORS[c] : "var(--text-secondary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={form.subClusters.includes(c)}
                  onChange={() => toggleSub(c)}
                  style={{ display: "none" }}
                />
                {CLUSTER_SHORT[c]}
              </label>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Tip: pick the rider's home cluster above, then tick any extras they can cover when their home cluster is quiet.
          </p>
        </div>
        {error && <p style={{ color: "var(--accent-red)", fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving..." : "Add Rider"}</button>
        </div>
      </div>
    </div>
  );
}

function EditRiderModal({
  rider,
  onClose,
  onSaved,
}: {
  rider: Rider;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: rider.name,
    phone: rider.phone,
    vehicle: rider.vehicle,
    status: rider.status,
    homeCluster: (rider.homeCluster ?? "") as "" | Rider["homeCluster"],
    subClusters: (rider.subClusters ?? []) as Rider["subClusters"],
    maxStops: rider.maxStops == null ? "" : String(rider.maxStops),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const toggleSub = (c: NonNullable<Rider["homeCluster"]>) => {
    setForm((f) => ({
      ...f,
      subClusters: f.subClusters.includes(c)
        ? f.subClusters.filter((x) => x !== c)
        : [...f.subClusters, c],
    }));
  };

  const submit = async () => {
    setError("");
    setSuccess("");
    if (!form.name.trim()) {
      setError("Rider name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        homeCluster: form.homeCluster || null,
        subClusters: form.subClusters.filter((c) => c && c !== form.homeCluster),
        maxStops: form.maxStops.trim() === "" ? null : Number(form.maxStops),
      };
      const res = await fetch(`/api/riders/${rider.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess("Saved.");
      onSaved();
      setTimeout(onClose, 500);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Edit Rider</h2>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>ID #{rider.id}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label>Vehicle</label>
            <select value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })}>
              <option value="Motorbike">Motorbike</option>
              <option value="Bicycle">Bicycle</option>
              <option value="Van">Van</option>
              <option value="Car">Car</option>
            </select>
          </div>
          <div><label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "inactive" })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label>Home Cluster</label>
            <select
              value={form.homeCluster ?? ""}
              onChange={(e) => setForm({ ...form, homeCluster: (e.target.value || null) as typeof form.homeCluster })}
              title="Primary cluster"
            >
              <option value="">— Unassigned —</option>
              {ALL_CLUSTERS.map((c) => (
                <option key={c} value={c}>{CLUSTER_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Max Stops / Shift</label>
            <input
              type="number"
              min="0"
              placeholder="No cap"
              value={form.maxStops}
              onChange={(e) => setForm({ ...form, maxStops: e.target.value })}
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", marginBottom: 6 }}>Also Covers</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ALL_CLUSTERS.map((c) => (
              <label
                key={c}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 6,
                  background: form.subClusters.includes(c)
                    ? `${CLUSTER_COLORS[c]}22`
                    : "var(--bg-primary)",
                  border: `1px solid ${form.subClusters.includes(c) ? CLUSTER_COLORS[c] : "var(--border)"}`,
                  cursor: "pointer",
                  color: form.subClusters.includes(c) ? CLUSTER_COLORS[c] : "var(--text-secondary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={form.subClusters.includes(c)}
                  onChange={() => toggleSub(c)}
                  style={{ display: "none" }}
                />
                {CLUSTER_SHORT[c]}
              </label>
            ))}
          </div>
        </div>
        {error && <p style={{ color: "var(--accent-red)", fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
        {success && <p style={{ color: "var(--accent-green)", fontSize: 13, margin: "12px 0 0" }}>{success}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Delete-rider confirmation modal.
 *
 * Two-step destructive:
 *   1) If the rider still has active orders (not delivered/cancelled/returned),
 *      the modal shows the count + a list of order links. Cancel is the only
 *      way out — the operator must reassign or close them first.
 *   2) If there are no active orders, the modal asks the operator to type
 *      the rider's name to confirm. Submit is disabled until the typed
 *      string matches (case-sensitive, trimmed).
 *
 * On a successful DELETE, the riderName snapshot is renewed on every order
 * they own before the row goes away, so print, history, and the public
 * /track page keep showing the real name.
 */
function DeleteRiderModal({
  rider,
  orders,
  onClose,
  onDeleted,
}: {
  rider: Rider;
  orders: Order[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmName, setConfirmName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Active = anything not delivered, cancelled, or returned. The API uses
  // the same definition, so this list mirrors what the server will return
  // on a 409.
  const activeOrders = useMemo(
    () =>
      orders
        .filter(
          (o) =>
            o.riderId === rider.id &&
            !["delivered", "cancelled", "returned"].includes(o.status)
        )
        .sort((a, b) => a.id - b.id),
    [orders, rider.id]
  );

  // Counts for the summary block — these come straight from the orders
  // already on the page (no extra roundtrip needed).
  const historical = useMemo(
    () => orders.filter((o) => o.riderId === rider.id),
    [orders, rider.id]
  );
  const deliveredCount = historical.filter((o) => o.status === "delivered").length;

  const matches = confirmName.trim() === rider.name;
  const canSubmit = !submitting && matches && activeOrders.length === 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/riders/${rider.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedName: confirmName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || `Delete failed (HTTP ${res.status}).`);
        setSubmitting(false);
        return;
      }
      onDeleted();
      onClose();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 60 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <Trash2 size={22} color="var(--color-danger, #c4434b)" />
          <h2 style={{ margin: 0, fontSize: 17 }}>Delete rider?</h2>
        </div>

        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
          <strong>{rider.name}</strong>
          {rider.phone ? ` · ${rider.phone}` : ""}
          {rider.vehicle ? ` · ${rider.vehicle}` : ""}
        </p>

        {historical.length > 0 ? (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              background: "var(--color-info-bg, rgba(56,132,255,0.08))",
              color: "var(--text-primary)",
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            {deliveredCount} delivered · {historical.length - deliveredCount - activeOrders.length} other
            closed. The name on every historic order stays intact.
          </div>
        ) : (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              background: "var(--bg-card)",
              color: "var(--text-muted)",
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            This rider has no orders. Nothing to archive.
          </div>
        )}

        {activeOrders.length > 0 && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid var(--color-danger, #c4434b)",
              background: "rgba(196,67,75,0.08)",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 600,
                color: "var(--color-danger, #c4434b)",
                marginBottom: 6,
              }}
            >
              <AlertTriangle size={14} />
              {activeOrders.length} active order{activeOrders.length === 1 ? "" : "s"} blocks the delete
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
              Reassign or close these orders first. Then come back and delete this rider.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {activeOrders.slice(0, 12).map((o) => (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  style={{
                    fontSize: 12,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "var(--bg-card)",
                    border: "1px solid var(--color-border)",
                    textDecoration: "none",
                    color: "var(--color-text)",
                  }}
                >
                  #{o.orderNo || o.id}
                </Link>
              ))}
              {activeOrders.length > 12 && (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  +{activeOrders.length - 12} more
                </span>
              )}
            </div>
          </div>
        )}

        {activeOrders.length === 0 && (
          <>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 4,
              }}
            >
              Type <strong>{rider.name}</strong> to confirm:
            </label>
            <input
              autoFocus
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={rider.name}
              spellCheck={false}
              autoComplete="off"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: `1px solid ${
                  confirmName.length === 0
                    ? "var(--color-border)"
                    : matches
                    ? "var(--color-success, #4caf50)"
                    : "var(--color-danger, #c4434b)"
                }`,
                background: "var(--color-bg-elevated)",
                color: "var(--color-text)",
                fontSize: 13,
                fontFamily: "inherit",
              }}
            />
          </>
        )}

        {error && (
          <p style={{ color: "var(--color-danger, #c4434b)", fontSize: 13, margin: "12px 0 0" }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn"
            disabled={!canSubmit}
            onClick={submit}
            style={{
              background:
                "var(--color-danger, #c4434b)",
              color: "#fff",
              border: "1px solid var(--color-danger, #c4434b)",
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? "Deleting…" : "Delete rider"}
          </button>
        </div>
      </div>
    </div>
  );
}
