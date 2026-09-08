"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Printer, ArrowLeft, Check, X, Truck } from "lucide-react";
import type { PurchaseOrder, PurchaseOrderStatus, Supplier, Settings } from "@/lib/types";
import { formatMoney, formatDate } from "@/lib/ui";

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  sent: "Sent to Supplier",
  received: "Received",
  cancelled: "Cancelled",
};

const STATUS_FLOW: PurchaseOrderStatus[] = ["draft", "sent", "received"];

export default function PurchaseOrderDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [p, s, set] = await Promise.all([
        fetch(`/api/purchase-orders/${id}`).then((r) => r.json()),
        fetch("/api/suppliers").then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json()),
      ]);
      setPo(p);
      setSuppliers(s);
      setSettings(set);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const setStatus = async (s: PurchaseOrderStatus) => {
    await fetch(`/api/purchase-orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: s }),
    });
    load();
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Loading...</div>;
  }

  if (!po) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>PO not found.</div>;
  }

  const supplier = suppliers.find((s) => s.id === po.supplierId);
  const cancelled = po.status === "cancelled";
  const received = po.status === "received";
  const statusBadgeClass = cancelled ? "status-cancelled" : received ? "status-delivered" : "status-confirmed";

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/purchase-orders" className="btn btn-secondary"><ArrowLeft size={15} /></Link>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            {po.poNumber} <span className={`status-badge ${statusBadgeClass}`}>{STATUS_LABELS[po.status]}</span>
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => window.print()}>
            <Printer size={15} /> Print PO
          </button>
        </div>
      </div>

      <div className="no-print" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px", color: "var(--text-secondary)", textTransform: "uppercase" }}>Status Flow</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            {STATUS_FLOW.map((s, i) => {
              const maxIdx = STATUS_FLOW.indexOf(po.status);
              const done = !cancelled && maxIdx >= i;
              const current = !cancelled && maxIdx === i;
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className="btn"
                  style={{
                    background: done ? "var(--tint-warning-18)" : current ? "var(--tint-brand-18)" : "var(--bg-primary)",
                    color: done ? "var(--accent-amber)" : current ? "var(--accent-green)" : "var(--text-muted)",
                    border: `1px solid ${done ? "color-mix(in srgb, var(--color-warning) 40%, transparent)" : current ? "color-mix(in srgb, var(--color-brand) 40%, transparent)" : "var(--border)"}`,
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {done && <Check size={12} />}
                  {STATUS_LABELS[s]}
                </button>
              );
            })}
            <button onClick={() => setStatus("cancelled")} className="btn btn-danger" style={{ fontSize: 12, marginLeft: 4 }}>
              <X size={12} /> Cancel
            </button>
          </div>
          {received && (
            <p style={{ fontSize: 12, color: "var(--accent-green)", margin: "12px 0 0" }}>
              <Truck size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Received on {po.receivedDate}. Stock has been added and product cost price updated.
            </p>
          )}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px", color: "var(--text-secondary)", textTransform: "uppercase" }}>Summary</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)" }}>Supplier</span>
            <span>{supplier?.name || `Supplier #${po.supplierId}`}</span>
            <span style={{ color: "var(--text-muted)" }}>Items</span>
            <span>{po.items.length}</span>
            <span style={{ color: "var(--text-muted)" }}>Subtotal</span>
            <span style={{ fontWeight: 600 }}>{formatMoney(po.subtotal)}</span>
            <span style={{ color: "var(--text-muted)" }}>Order Date</span>
            <span>{po.date}</span>
            <span style={{ color: "var(--text-muted)" }}>Expected</span>
            <span>{po.expectedDate || "—"}</span>
          </div>
        </div>
      </div>

      <div className="print-area card" style={{ padding: 28, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #000", paddingBottom: 14, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{settings?.businessName || ""}</h2>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#444" }}>{settings?.tagline}</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#444" }}>{settings?.address} · {settings?.phone}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 1 }}>PURCHASE ORDER</div>
            <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600 }}>{po.poNumber}</div>
            <div style={{ fontSize: 11, color: "#444" }}>Date: {formatDate(po.date)}</div>
            {po.expectedDate && <div style={{ fontSize: 11, color: "#444" }}>Expected: {formatDate(po.expectedDate)}</div>}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, fontSize: 12 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>To (Supplier)</div>
            <div style={{ fontWeight: 600 }}>{supplier?.name || "—"}</div>
            {supplier?.contact && <div>{supplier.contact}</div>}
            {supplier?.address && <div>{supplier.address}</div>}
            {supplier?.phone && <div>Phone: {supplier.phone}</div>}
            {supplier?.paymentTerms && <div style={{ fontStyle: "italic", color: "#444", marginTop: 4 }}>Terms: {supplier.paymentTerms}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Ship To</div>
            <div style={{ fontWeight: 600 }}>{settings?.businessName || ""}</div>
            <div>{settings?.address}</div>
            <div>{settings?.phone}</div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #000" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>#</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Item Description</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Unit</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Qty</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Unit Cost</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((it, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "6px 8px", color: "#666" }}>{i + 1}</td>
                <td style={{ padding: "6px 8px" }}>
                  {it.name}
                  {it.nameBn && <span style={{ color: "#666" }}> ({it.nameBn})</span>}
                </td>
                <td style={{ padding: "6px 8px" }}>{it.unit}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{it.qty}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{formatMoney(it.unitCost)}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>{formatMoney(it.lineTotal)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} style={{ padding: "8px", textAlign: "right", fontWeight: 700, borderTop: "1.5px solid #000" }}>TOTAL</td>
              <td style={{ padding: "8px", textAlign: "right", fontWeight: 800, fontSize: 14, borderTop: "1.5px solid #000" }}>
                {formatMoney(po.subtotal)}
              </td>
            </tr>
          </tbody>
        </table>

        {po.note && (
          <div style={{ fontSize: 12, color: "#444", marginBottom: 14 }}>
            <span style={{ fontWeight: 600 }}>Note: </span>{po.note}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24, fontSize: 11 }}>
          <div>
            <div style={{ borderBottom: "1px solid #000", height: 36 }}></div>
            <div style={{ marginTop: 4, color: "#444" }}>Authorized by</div>
          </div>
          <div>
            <div style={{ borderBottom: "1px solid #000", height: 36 }}></div>
            <div style={{ marginTop: 4, color: "#444" }}>Supplier acknowledgement</div>
          </div>
        </div>

        <p style={{ margin: "24px 0 0", fontSize: 10, color: "#666", textAlign: "center" }}>
          Please confirm receipt and delivery date. {settings?.businessName || ""}.
        </p>
      </div>
    </div>
  );
}