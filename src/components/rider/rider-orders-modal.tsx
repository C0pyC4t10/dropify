"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import type { Order, OrderStatus, Rider } from "@/lib/types";
import { formatMoney } from "@/lib/ui";
import { OrderRowsTable } from "@/components/rider/order-rows-table";

type StatusFilter = "all" | "active" | "delivered" | "cancelled";

interface Props {
  rider: Rider;
  orders: Order[];
  onClose: () => void;
}

function isActive(o: Order) {
  return !["delivered", "cancelled"].includes(o.status);
}

export function RiderOrdersModal({ rider, orders, onClose }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const ownOrders = useMemo(
    () => orders.filter((o) => o.riderId === rider.id && o.deliveryMode !== "pathao"),
    [orders, rider.id],
  );

  const filtered = useMemo(() => {
    if (statusFilter === "all") return ownOrders;
    if (statusFilter === "active") return ownOrders.filter(isActive);
    if (statusFilter === "delivered") return ownOrders.filter((o) => o.status === "delivered");
    if (statusFilter === "cancelled") return ownOrders.filter((o) => o.status === "cancelled");
    return ownOrders;
  }, [ownOrders, statusFilter]);

  const delivered = ownOrders.filter((o) => o.status === "delivered");
  const pending = ownOrders.filter(isActive);
  const revenue = delivered.reduce((s, o) => s + o.total, 0);
  const payout = delivered.reduce((s, o) => s + (o.riderCost || 0), 0);

  const filterBtn = (key: StatusFilter, label: string, count: number) => {
    const active = statusFilter === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setStatusFilter(key)}
        className="btn"
        style={{
          fontSize: 12,
          padding: "5px 12px",
          background: active ? "var(--tint-brand-18)" : "var(--bg-card)",
          color: active ? "var(--accent-green)" : "var(--text-secondary)",
          border: `1px solid ${active ? "color-mix(in srgb, var(--color-brand) 40%, transparent)" : "var(--border)"}`,
        }}
      >
        {label} <span style={{ opacity: 0.7, marginLeft: 4 }}>({count})</span>
      </button>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 1200, width: "95vw" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>Rider</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{rider.name}</h2>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              {rider.vehicle} · {rider.phone}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: "4px 8px" }}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
            marginBottom: 14,
            padding: 12,
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Delivered</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-green)" }}>{delivered.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Active</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: pending.length > 0 ? "var(--accent-amber)" : "var(--text-muted)" }}>{pending.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Revenue</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{formatMoney(revenue)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Payout</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: payout > 0 ? "var(--accent-red)" : "var(--text-muted)" }}>{formatMoney(payout)}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {filterBtn("all", "All", ownOrders.length)}
          {filterBtn("active", "Active", pending.length)}
          {filterBtn("delivered", "Delivered", delivered.length)}
          {filterBtn("cancelled", "Cancelled", ownOrders.filter((o) => o.status === "cancelled").length)}
        </div>

        <div style={{ maxHeight: "55vh", overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
          <OrderRowsTable orders={filtered} dense />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <Link
            href={`/riders/${rider.id}`}
            className="btn btn-secondary"
            style={{ textDecoration: "none" }}
          >
            <ExternalLink size={13} /> Open full page
          </Link>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
