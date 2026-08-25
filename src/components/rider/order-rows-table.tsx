"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatMoney } from "@/lib/ui";
import type { Order } from "@/lib/types";

/** Compact order rows shared by the rider modal, full rider page, and manifest. */
export function OrderRowsTable({ orders, dense = false }: { orders: Order[]; dense?: boolean }) {
  if (orders.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: 13, padding: 24, textAlign: "center", margin: 0 }}>
        No orders match the current filters.
      </p>
    );
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table" style={{ fontSize: dense ? 12 : 13 }}>
        <thead>
          <tr>
            <th>Order</th>
            <th>Confirmed</th>
            <th>Customer</th>
            <th>Area / Address</th>
            <th>Items</th>
            <th>Status</th>
            <th style={{ textAlign: "right" }}>Total</th>
            <th style={{ textAlign: "right" }}>Paid</th>
            <th style={{ textAlign: "right" }}>Due</th>
            <th style={{ textAlign: "right" }}>Rider Cost</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const due = Math.max(0, o.total - o.paid);
            const confirmed = o.confirmedAt ? formatDateTime(o.confirmedAt) : "—";
            const items = o.items.map((it) => `${it.qty}${it.unit === "kg" ? "kg" : "pc"} ${it.name}`).join(", ");
            const fullAddress = o.address ? `${o.area}${o.area ? " — " : ""}${o.address}` : o.area;
            return (
              <tr key={o.id}>
                <td>
                  <Link
                    href={`/orders/${o.id}`}
                    style={{ color: "var(--accent-green)", fontWeight: 600, textDecoration: "none" }}
                  >
                    {o.orderNo}
                  </Link>
                </td>
                <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap", fontSize: 12 }}>{confirmed}</td>
                <td>
                  <div style={{ fontWeight: 500 }}>{o.customerName || "—"}</div>
                  <a
                    href={`tel:${o.customerPhone}`}
                    style={{ fontSize: 11, color: "var(--text-muted)", textDecoration: "none" }}
                  >
                    {o.customerPhone || ""}
                  </a>
                </td>
                <td style={{ color: "var(--text-secondary)" }} title={fullAddress}>
                  <div style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.area || "—"}
                  </div>
                  {o.address && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {o.address}
                    </div>
                  )}
                </td>
                <td style={{ fontSize: 12, color: "var(--text-secondary)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={items}>
                  {items}
                </td>
                <td>
                  <StatusBadge status={o.status} />
                </td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{formatMoney(o.total)}</td>
                <td style={{ textAlign: "right", color: "var(--text-secondary)" }}>{formatMoney(o.paid)}</td>
                <td style={{ textAlign: "right", color: due > 0 ? "var(--accent-red)" : "var(--accent-green)", fontWeight: due > 0 ? 600 : 400 }}>
                  {due > 0 ? formatMoney(due) : "—"}
                </td>
                <td style={{ textAlign: "right", color: o.riderCost ? "var(--text-secondary)" : "var(--text-muted)" }}>
                  {o.riderCost ? formatMoney(o.riderCost) : "—"}
                </td>
                <td style={{ color: "var(--accent-red)", fontStyle: "italic", fontSize: 12, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.note}>
                  {o.note || ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
