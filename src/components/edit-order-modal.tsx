"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { Customer, DeliveryMode, Order, OrderSource, Product } from "@/lib/types";
import { formatMoney, DHAKA_AREAS_FLAT } from "@/lib/ui";

interface Props {
  order: Order;
  products: Product[];
  customers: Customer[];
  onClose: () => void;
  onSaved: () => void;
}

interface Row {
  productId: number;
  qty: string;
  unitPrice: string;
}

export function EditOrderModal({ order, products, customers, onClose, onSaved }: Props) {
  const [customerId, setCustomerId] = useState<string>(order.customerId ? String(order.customerId) : "");
  const [customerName, setCustomerName] = useState(order.customerName);
  const [customerPhone, setCustomerPhone] = useState(order.customerPhone);
  const [area, setArea] = useState(
    DHAKA_AREAS_FLAT.some((a) => a.toLowerCase() === (order.area || "").toLowerCase()) ? order.area || "Aftabnagar" : "Other"
  );
  const [customArea, setCustomArea] = useState(
    DHAKA_AREAS_FLAT.some((a) => a.toLowerCase() === (order.area || "").toLowerCase()) ? "" : order.area || ""
  );
  const [address, setAddress] = useState(order.address);
  const [date, setDate] = useState(order.date);
  const [paymentMethod, setPaymentMethod] = useState(order.paymentMethod);
  const [paid, setPaid] = useState(String(order.paid));
  const [discount, setDiscount] = useState(String(order.discount));
  const [deliveryFee, setDeliveryFee] = useState(String(order.deliveryFee));
  const [source, setSource] = useState<OrderSource>(order.source);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(order.deliveryMode);
  const [pathaoTrackingId, setPathaoTrackingId] = useState(order.pathaoTrackingId);
  const [pathaoFare, setPathaoFare] = useState(String(order.pathaoFare));
  const [riderCost, setRiderCost] = useState(String(order.riderCost ?? 0));
  const [note, setNote] = useState(order.note);
  const [rows, setRows] = useState<Row[]>(
    order.items.map((it) => ({
      productId: it.productId,
      qty: String(it.qty),
      unitPrice: String(it.unitPrice),
    }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const pickCustomer = (idStr: string) => {
    setCustomerId(idStr);
    const c = customers.find((x) => String(x.id) === idStr);
    if (c) {
      setCustomerName(c.name);
      setCustomerPhone(c.phone);
      if (DHAKA_AREAS_FLAT.some((a) => a.toLowerCase() === c.area.toLowerCase())) {
        setArea(c.area);
        setCustomArea("");
      } else {
        setArea("Other");
        setCustomArea(c.area);
      }
      setAddress(c.address);
    }
  };

  const rowsComputed = rows.map((r) => {
    const p = products.find((x) => x.id === Number(r.productId));
    const qty = parseFloat(r.qty) || 0;
    const unitPrice = parseFloat(r.unitPrice) || 0;
    return { ...r, product: p, qty, unitPrice, lineTotal: qty * unitPrice };
  });
  const subtotal = rowsComputed.reduce((s, r) => s + r.lineTotal, 0);
  const total = Math.max(0, subtotal + (parseFloat(deliveryFee) || 0) - (parseFloat(discount) || 0));

  const addRow = () => {
    const avail = products.find((p) => !rows.some((r) => Number(r.productId) === p.id));
    setRows([
      ...rows,
      {
        productId: avail?.id ?? products[0]?.id ?? 0,
        qty: "1",
        unitPrice: avail ? String(avail.sellPrice) : "0",
      },
    ]);
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
    setRows(
      rows.map((r, i) =>
        i === idx ? { ...r, productId: Number(productId), unitPrice: p ? String(p.sellPrice) : r.unitPrice } : r
      )
    );
  };

  const submit = async () => {
    setError("");
    setSuccess("");
    if (!customerName.trim()) {
      setError("Customer name is required.");
      return;
    }
    if (rowsComputed.some((r) => r.qty <= 0)) {
      setError("Quantities must be greater than zero.");
      return;
    }
    setSaving(true);
    try {
      const resolvedArea = area === "Other" ? customArea.trim() : area;
      const payload = {
        date,
        customerId: customerId ? Number(customerId) : null,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        area: resolvedArea,
        address,
        items: rowsComputed.map((r) => ({
          productId: r.productId,
          name: r.product?.name || "Item",
          nameBn: r.product?.nameBn || "",
          unit: r.product?.unit || "kg",
          qty: r.qty,
          unitPrice: r.unitPrice,
          lineTotal: Math.round(r.lineTotal * 100) / 100,
        })),
        subtotal: Math.round(subtotal * 100) / 100,
        deliveryFee: parseFloat(deliveryFee) || 0,
        discount: parseFloat(discount) || 0,
        total: Math.round(total * 100) / 100,
        paid: parseFloat(paid) || 0,
        paymentMethod,
        source,
        deliveryMode,
        pathaoTrackingId: pathaoTrackingId.trim(),
        pathaoFare: parseFloat(pathaoFare) || 0,
        riderCost: parseFloat(riderCost) || 0,
        note,
      };
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSuccess("Saved.");
      onSaved();
      setTimeout(onClose, 600);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 880 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Edit Order</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
              {order.orderNo} · stock will be reconciled automatically
            </p>
          </div>
          <button className="btn btn-secondary" onClick={onClose}><X size={15} /></button>
        </div>

        {/* Customer + delivery */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label>Customer (existing)</label>
            <select value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
              <option value="">— Walk-in / new —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>
              ))}
            </select>
          </div>
          <div><label>Order Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label>Customer Name *</label><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></div>
          <div><label>Phone</label><input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></div>
          <div>
            <label>Area (Dhaka Metro)</label>
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              {DHAKA_AREAS_FLAT.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
              <option value="Other">Other (type custom)…</option>
            </select>
            {area === "Other" && (
              <input
                value={customArea}
                onChange={(e) => setCustomArea(e.target.value)}
                placeholder="Type area name"
                style={{ marginTop: 6 }}
              />
            )}
          </div>
          <div><label>Address</label><input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div>
            <label>Order Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value as OrderSource)}>
              <option value="manual">Manual (in-store / phone)</option>
              <option value="facebook">Facebook</option>
              <option value="wordpress">WordPress website</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="walkin">Walk-in</option>
            </select>
          </div>
          <div>
            <label>Delivery Mode</label>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setDeliveryMode("own")}
                style={{
                  flex: 1,
                  background: deliveryMode === "own" ? "rgba(77,158,71,0.18)" : "var(--bg-primary)",
                  color: deliveryMode === "own" ? "var(--accent-green)" : "var(--text-secondary)",
                  border: `1px solid ${deliveryMode === "own" ? "rgba(77,158,71,0.4)" : "var(--border)"}`,
                }}
              >
                Own Rider
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setDeliveryMode("pathao")}
                style={{
                  flex: 1,
                  background: deliveryMode === "pathao" ? "rgba(232,163,61,0.18)" : "var(--bg-primary)",
                  color: deliveryMode === "pathao" ? "var(--accent-amber)" : "var(--text-secondary)",
                  border: `1px solid ${deliveryMode === "pathao" ? "rgba(232,163,61,0.4)" : "var(--border)"}`,
                }}
              >
                Hired Pathao
              </button>
            </div>
          </div>
        </div>

        {deliveryMode === "pathao" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div><label>Pathao Tracking ID</label><input value={pathaoTrackingId} onChange={(e) => setPathaoTrackingId(e.target.value)} /></div>
            <div><label>Pathao Fare (৳)</label><input type="number" value={pathaoFare} onChange={(e) => setPathaoFare(e.target.value)} /></div>
          </div>
        )}

        {/* Items */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ marginBottom: 0 }}>Items</label>
            <button className="btn btn-secondary" onClick={addRow} style={{ fontSize: 12 }}><Plus size={13} /> Add item</button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Product</th>
                <th>Qty (kg/pcs)</th>
                <th>Unit Price</th>
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
                  <td><input type="number" min="0" step="0.5" value={r.unitPrice} onChange={(e) => updateRow(idx, "unitPrice", e.target.value)} /></td>
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

        {/* Totals + payment */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label>Delivery Fee (৳)</label>
            <input type="number" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} />
          </div>
          <div>
            <label>Flat Discount (৳)</label>
            <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div>
            <label>Rider Cost (৳)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={riderCost}
              onChange={(e) => setRiderCost(e.target.value)}
              placeholder="0"
              title="Payout to own rider for this order"
            />
          </div>
          <div>
            <label>Total (auto)</label>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-green)", paddingTop: 8 }}>{formatMoney(total)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label>Payment Method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as Order["paymentMethod"])}>
              <option value="cod">Cash on Delivery</option>
              <option value="bkash">bKash</option>
              <option value="nagad">Nagad</option>
              <option value="card">Card</option>
              <option value="advance">Advance</option>
            </select>
          </div>
          <div><label>Paid (৳)</label><input type="number" value={paid} onChange={(e) => setPaid(e.target.value)} /></div>
          <div><label>Note</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" /></div>
        </div>

        {error && <p style={{ color: "var(--accent-red)", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
        {success && <p style={{ color: "var(--accent-green)", fontSize: 13, margin: "0 0 12px" }}>{success}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}