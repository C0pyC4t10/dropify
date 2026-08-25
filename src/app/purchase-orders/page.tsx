"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { PurchaseOrder, Product, Supplier, PurchaseOrderStatus } from "@/lib/types";
import { formatMoney, formatDate } from "@/lib/ui";
import { PurchaseOrderForm } from "@/components/purchase-order-form";
import { ExportMenu, type ExportColumn } from "@/components/export-menu";

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  received: "Received",
  cancelled: "Cancelled",
};

const FILTERS: Array<PurchaseOrderStatus | "all"> = ["all", "draft", "sent", "received", "cancelled"];

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filter, setFilter] = useState<PurchaseOrderStatus | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [p, pr, s] = await Promise.all([
        fetch("/api/purchase-orders").then((r) => r.json()),
        fetch("/api/products").then((r) => r.json()),
        fetch("/api/suppliers").then((r) => r.json()),
      ]);
      setPos(p);
      setProducts(pr);
      setSuppliers(s);
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

  const supplierById = (id: number) => suppliers.find((s) => s.id === id);

  const filtered = pos.filter((p) => filter === "all" || p.status === filter);

  const poExportCols: ExportColumn<PurchaseOrder>[] = [
    { header: "PO #", get: (p) => p.poNumber },
    { header: "Date", get: (p) => (p.date || "").slice(0, 10) },
    { header: "Supplier", get: (p) => supplierById(p.supplierId)?.name || `#${p.supplierId}` },
    { header: "Items", get: (p) => p.items.map((it) => `${it.qty}${it.unit === "kg" ? "kg" : "pc"} ${it.name}`).join("; ") },
    { header: "Total (BDT)", get: (p) => p.subtotal },
    { header: "Status", get: (p) => STATUS_LABELS[p.status] },
    { header: "Expected", get: (p) => p.expectedDate ? p.expectedDate.slice(0,10) : "" },
    { header: "Received", get: (p) => p.receivedDate ? p.receivedDate.slice(0,10) : "" },
    { header: "Note", get: (p) => p.note },
  ];

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Loading...</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Purchase Orders</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <ExportMenu
            rows={filtered}
            cols={poExportCols}
            filename="purchase-orders"
            title="Purchase Orders"
            subtitle={filter === "all" ? "all statuses" : STATUS_LABELS[filter]}
            orientation="landscape"
            label="Export"
          />
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={15} /> New PO
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="btn"
            style={{
              fontSize: 12,
              background: filter === f ? "rgba(232,163,61,0.18)" : "var(--bg-card)",
              color: filter === f ? "var(--accent-amber)" : "var(--text-secondary)",
              border: `1px solid ${filter === f ? "rgba(232,163,61,0.4)" : "var(--border)"}`,
            }}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>PO #</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Items</th>
                <th>Expected</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ color: "var(--text-muted)", padding: 28, textAlign: "center" }}>
                    No purchase orders yet.
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const sup = supplierById(p.supplierId);
                return (
                  <tr key={p.id} onClick={() => (window.location.href = `/purchase-orders/${p.id}`)} style={{ cursor: "pointer" }}>
                    <td style={{ color: "var(--accent-amber)", fontWeight: 600 }}>
                      <Link href={`/purchase-orders/${p.id}`} style={{ color: "inherit", textDecoration: "none" }}>{p.poNumber}</Link>
                    </td>
                    <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{p.date}</td>
                    <td>{sup?.name || `Supplier #${p.supplierId}`}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{p.items.length}</td>
                    <td style={{ color: "var(--text-muted)" }}>{p.expectedDate || "—"}</td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(p.subtotal)}</td>
                    <td><span className={`status-badge status-${p.status === "received" ? "delivered" : p.status === "cancelled" ? "cancelled" : "confirmed"}`}>{STATUS_LABELS[p.status]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <PurchaseOrderForm
          products={products}
          suppliers={suppliers}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}