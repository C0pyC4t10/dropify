"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { Product, Supplier } from "@/lib/types";
import { formatMoney } from "@/lib/ui";

interface Props {
  products: Product[];
  suppliers: Supplier[];
  defaultSupplierId?: number;
  onClose: () => void;
  onSaved: () => void;
}

interface Row {
  productId: number;
  qty: string;
  unitCost: string;
}

export function PurchaseOrderForm({ products, suppliers, defaultSupplierId, onClose, onSaved }: Props) {
  const [supplierId, setSupplierId] = useState<string>(defaultSupplierId ? String(defaultSupplierId) : suppliers[0]?.id ? String(suppliers[0].id) : "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([{ productId: products[0]?.id ?? 0, qty: "10", unitCost: products[0] ? String(products[0].costPrice) : "0" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rowsComputed = rows.map((r) => {
    const p = products.find((x) => x.id === r.productId);
    const qty = parseFloat(r.qty) || 0;
    const unitCost = parseFloat(r.unitCost) || 0;
    return { ...r, product: p, qty, unitCost, lineTotal: qty * unitCost };
  });
  const subtotal = rowsComputed.reduce((s, r) => s + r.lineTotal, 0);

  const addRow = () => {
    const avail = products.find((p) => !rows.some((r) => r.productId === p.id));
    const next = avail ?? products[0];
    setRows([...rows, { productId: next?.id ?? 0, qty: "10", unitCost: next ? String(next.costPrice) : "0" }]);
  };

  const updateRow = (idx: number, key: keyof Row, val: string) => {
    setRows(rows.map((r, i) => (i === idx ? { ...r, [key]: val } : r)));
  };

  const removeRow = (idx: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== idx));
  };

  const onPickProduct = (idx: number, productId: string) => {
    const p = products.find((x) => x.id === Number(productId));
    setRows(rows.map((r, i) => (i === idx ? { ...r, productId: Number(productId), unitCost: p ? String(p.costPrice) : r.unitCost } : r)));
  };

  const submit = async () => {
    setError("");
    if (!supplierId) {
      setError("Pick a supplier first.");
      return;
    }
    if (rowsComputed.some((r) => !r.product || r.qty <= 0 || r.unitCost < 0)) {
      setError("All items need a product, positive quantity, and unit cost.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date,
        supplierId: Number(supplierId),
        items: rowsComputed.map((r) => ({
          productId: r.productId,
          qty: r.qty,
          unitCost: r.unitCost,
        })),
        expectedDate,
        note,
      };
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const created = await res.json();
      onSaved();
      window.open(`/inventory/purchase-orders/${created.id}?print=1`, "_blank");
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 880 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>New Purchase Order</h2>
          <button className="btn btn-secondary" onClick={onClose}><X size={15} /></button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label>Supplier *</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— Pick supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div><label>Order Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label>Expected Delivery</label><input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ marginBottom: 0 }}>Line Items (at supplier cost)</label>
            <button className="btn btn-secondary" onClick={addRow} style={{ fontSize: 12 }}><Plus size={13} /> Add item</button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Product</th>
                <th>Qty (kg/pcs)</th>
                <th>Unit Cost (৳)</th>
                <th>Total</th>
                <th style={{ width: 34 }}></th>
              </tr>
            </thead>
            <tbody>
              {rowsComputed.map((r, idx) => (
                <tr key={idx}>
                  <td>
                    <select value={r.productId} onChange={(e) => onPickProduct(idx, e.target.value)}>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} — {p.nameBn}</option>
                      ))}
                    </select>
                  </td>
                  <td><input type="number" min="0" step="0.1" value={r.qty} onChange={(e) => updateRow(idx, "qty", e.target.value)} /></td>
                  <td><input type="number" min="0" step="0.5" value={r.unitCost} onChange={(e) => updateRow(idx, "unitCost", e.target.value)} /></td>
                  <td style={{ fontWeight: 600 }}>{formatMoney(r.lineTotal)}</td>
                  <td>
                    <button className="btn" style={{ background: "transparent", padding: 4 }} onClick={() => removeRow(idx)}>
                      <Trash2 size={14} color="var(--accent-red)" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label>Subtotal</label>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-green)", paddingTop: 8 }}>{formatMoney(subtotal)}</div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Note to Supplier</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. fresh cut, deliver before 8 AM" />
          </div>
        </div>

        {error && <p style={{ color: "var(--accent-red)", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Saving..." : "Save & Print PO"}
          </button>
        </div>
      </div>
    </div>
  );
}