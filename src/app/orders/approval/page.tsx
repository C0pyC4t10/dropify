"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Check,
  X,
  ArrowLeft,
  Search,
  Inbox,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Zap,
  Layers,
} from "lucide-react";
import type { Order, Product, Settings } from "@/lib/types";
import { formatMoney } from "@/lib/ui";
import { getAreaCentroid } from "@/lib/area-centroids";

const ClientDhakaClusterMap = dynamic(
  () => import("@/components/map/client-dhaka-cluster-map"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: 420,
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

export default function ApprovalQueuePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [cancelFor, setCancelFor] = useState<Order | null>(null);

  // Shop pin for the cluster map. Falls back to canonical Aftabnagar
  // centroid before /api/settings resolves.
  const aftab = getAreaCentroid("Aftabnagar");
  const [shop, setShop] = useState<{ lat: number; lng: number; label: string }>({
    lat: aftab.lat,
    lng: aftab.lng,
    label: "Shop",
  });

  const load = useCallback(async () => {
    try {
      const [o, p, s] = await Promise.all([
        fetch("/api/orders").then((r) => r.json()),
        fetch("/api/products").then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json() as Promise<Settings>),
      ]);
      setOrders(o as Order[]);
      setProducts(p as Product[]);
      if (s && s.shopLat != null && s.shopLng != null) {
        setShop({
          lat: s.shopLat,
          lng: s.shopLng,
          label: s.businessName?.trim() || "Shop",
        });
      }
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

  // Pending orders only. (Manual orders land here only if an operator moves
  // one back to pending-approval manually — not currently surfaced in UI but
  // possible.)
  const pending = useMemo(
    () => orders.filter((o) => o.status === "pending-approval"),
    [orders]
  );

  const filtered = useMemo(() => {
    if (!query) return pending;
    const q = query.toLowerCase();
    return pending.filter((o) => {
      return (
        o.orderNo.toLowerCase().includes(q) ||
        (o.customerName || "").toLowerCase().includes(q) ||
        (o.customerPhone || "").includes(q) ||
        (o.wpOrderId || "").toLowerCase().includes(q) ||
        (o.area || "").toLowerCase().includes(q)
      );
    });
  }, [pending, query]);

  const flash = (kind: "ok" | "err", text: string) => {
    setBanner({ kind, text });
    setTimeout(() => setBanner(null), 3500);
  };

  const productById = useMemo(() => {
    const m = new Map<number, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const summarize = (o: Order): string => {
    const parts = o.items.map((it) => {
      const p = productById.get(it.productId);
      const name = p?.nameBn || p?.name || it.name || "Item";
      return `${it.qty}${it.unit === "pcs" ? "pc" : "kg"} ${name}`;
    });
    return parts.join(" · ");
  };

  const approve = async (id: number) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/orders/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        flash("err", data.error || `Approve failed (HTTP ${res.status})`);
      } else {
        flash("ok", `Approved #${id} → ${data.order.orderNo}`);
        await load();
      }
    } catch (e) {
      flash("err", String(e));
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (id: number, reason: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/orders/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        flash("err", data.error || `Cancel failed (HTTP ${res.status})`);
      } else {
        flash("ok", `Cancelled #${id}`);
        setCancelFor(null);
        await load();
      }
    } catch (e) {
      flash("err", String(e));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
        Loading…
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Link href="/orders" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
              Orders
            </Link>
            <span>/</span>
            <span style={{ color: "var(--text-secondary)" }}>WordPress Approval</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            WordPress Approval Queue
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: "2px 10px",
                borderRadius: 999,
                background:
                  pending.length > 0 ? "rgba(245, 158, 11, 0.18)" : "var(--bg-elev, #f0f0f0)",
                color:
                  pending.length > 0 ? "var(--accent-amber)" : "var(--text-muted)",
                border:
                  pending.length > 0
                    ? "1px solid rgba(245, 158, 11, 0.4)"
                    : "1px solid var(--border)",
              }}
            >
              {pending.length} pending
            </span>
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            WP orders land here automatically. Approving deducts stock and moves the
            order to the live list. Cancelling leaves stock untouched.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/orders/quick" className="btn btn-primary">
            <Zap size={15} /> Quick Order
          </Link>
          <Link href="/orders" className="btn btn-secondary">
            <ArrowLeft size={15} /> Back to Orders
          </Link>
          <button className="btn btn-secondary" onClick={load} title="Reload">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Dhaka Delivery Grid — same regional map as /routes. */}
      <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid var(--accent-amber)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Layers size={16} color="var(--accent-amber)" />
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Dhaka Delivery Grid</h2>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Your shop (red pin) and the four operational cluster regions. Click any region to see its description.
          </span>
        </div>
        <ClientDhakaClusterMap shop={shop} height={420} />
      </div>

      {banner && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background:
              banner.kind === "ok"
                ? "rgba(77,158,71,0.10)"
                : "rgba(226,59,46,0.10)",
            border:
              banner.kind === "ok"
                ? "1px solid rgba(77,158,71,0.35)"
                : "1px solid rgba(226,59,46,0.35)",
            color: banner.kind === "ok" ? "var(--accent-green)" : "var(--accent-red)",
            fontSize: 13,
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {banner.kind === "err" && <AlertTriangle size={14} />}
          {banner.text}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", width: 320 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--text-muted)" }} />
          <input
            placeholder="Search order no / customer / wp id"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Tip: click an order row to inspect details before approving.
        </span>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Source</th>
                <th>Customer</th>
                <th>Area</th>
                <th>Items</th>
                <th>Total</th>
                <th>Stock</th>
                <th style={{ width: 200 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ color: "var(--text-muted)", padding: 36, textAlign: "center" }}>
                    {pending.length === 0 ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <Inbox size={16} /> No orders waiting for approval.
                      </span>
                    ) : (
                      "No matching orders."
                    )}
                  </td>
                </tr>
              )}
              {filtered.map((o) => (
                <tr key={o.id} style={busy === o.id ? { opacity: 0.5 } : undefined}>
                  <td>
                    <Link
                      href={`/orders/${o.id}`}
                      target="_blank"
                      style={{ color: "var(--text-primary)", fontWeight: 500, textDecoration: "none" }}
                    >
                      {o.orderNo}
                    </Link>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                      {o.date}
                      {o.wpOrderId && (
                        <>
                          <span>·</span>
                          <span title="WooCommerce order id">WC #{o.wpOrderId}</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: "rgba(120, 80, 220, 0.12)",
                        color: "rgba(120, 80, 220, 1)",
                        border: "1px solid rgba(120, 80, 220, 0.3)",
                      }}
                    >
                      {o.source.toUpperCase()}
                    </span>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {o.paymentMethod?.toUpperCase()}
                    </div>
                  </td>
                  <td>
                    <Link href={`/customers/${o.customerId || ""}`} style={{ color: "var(--text-primary)", textDecoration: "none" }}>
                      <span style={{ fontWeight: 500 }}>{o.customerName}</span>
                    </Link>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{o.customerPhone}</div>
                  </td>
                  <td>{o.area || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                  <td style={{ fontSize: 12, color: "var(--text-secondary)", maxWidth: 280 }}>
                    {summarize(o)}
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {o.items.length} item{o.items.length !== 1 ? "s" : ""}
                    </div>
                  </td>
                  <td style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    ৳{o.total.toLocaleString("en-IN")}
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "rgba(245, 158, 11, 0.12)",
                        color: "var(--accent-amber)",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                      }}
                    >
                      NOT DEDUCTED
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Link href={`/orders/${o.id}`} target="_blank" className="btn btn-secondary" style={{ padding: "6px 10px", fontSize: 12 }} title="Open in new tab">
                        <ExternalLink size={13} />
                      </Link>
                      <button
                        className="btn btn-primary"
                        disabled={busy === o.id}
                        onClick={() => approve(o.id)}
                        style={{ fontSize: 12, padding: "6px 12px" }}
                      >
                        <Check size={13} /> Approve
                      </button>
                      <button
                        className="btn btn-danger"
                        disabled={busy === o.id}
                        onClick={() => setCancelFor(o)}
                        style={{ fontSize: 12, padding: "6px 12px" }}
                      >
                        <X size={13} /> Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {cancelFor && (
        <CancelReasonModal
          order={cancelFor}
          busy={busy === cancelFor.id}
          onClose={() => setCancelFor(null)}
          onConfirm={(reason) => cancel(cancelFor.id, reason)}
        />
      )}
    </div>
  );
}

function CancelReasonModal({
  order,
  busy,
  onClose,
  onConfirm,
}: {
  order: Order;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const submit = () => {
    const r = reason.trim() || "Cancelled from approval queue";
    onConfirm(r);
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 12px" }}>
          Cancel {order.orderNo}?
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
          Cancelling leaves stock untouched (it was never deducted) and flips the
          order to status <b>cancelled</b>. WordPress will also be notified.
        </p>
        <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Reason (optional)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Out of stock / wrong address / duplicate order"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg-elev, transparent)",
            color: "var(--text-primary)",
            fontFamily: "inherit",
            fontSize: 13,
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Keep
          </button>
          <button className="btn btn-danger" onClick={submit} disabled={busy}>
            {busy ? "Cancelling…" : "Cancel Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
