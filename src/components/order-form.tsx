"use client";

import { useState, useMemo } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { Customer, DeliveryMode, Order, OrderSource, Product, Settings } from "@/lib/types";
import { formatMoney, DHAKA_AREAS_FLAT, CLUSTER_COLORS, CLUSTER_SHORT, SUB_CLUSTER_LABELS } from "@/lib/ui";
import { getLocationForArea } from "@/lib/locations";
import CustomerMatchBanner, { type CustomerMatch } from "./customer-match-banner";

interface Props {
  products: Product[];
  customers: Customer[];
  settings: Settings | null;
  onClose: () => void;
  onSaved: () => void;
  /** When true, render as a page section (no modal-overlay backdrop). */
  embedded?: boolean;
}

interface RowItem {
  productId: number;
  qty: string;
  unitPrice: string;
}

export function OrderForm({ products, customers, settings, onClose, onSaved, embedded }: Props) {
  const [customerId, setCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [area, setArea] = useState("Aftabnagar");
  const [customArea, setCustomArea] = useState("");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<string>("cod");
  const [paid, setPaid] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [source, setSource] = useState<OrderSource>("manual");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("own");
  const [pathaoTrackingId, setPathaoTrackingId] = useState("");
  const [pathaoFare, setPathaoFare] = useState("0");
  const [riderCost, setRiderCost] = useState("0");
  const [note, setNote] = useState("");
  const [savedNotice, setSavedNotice] = useState<string>("");
  const [rows, setRows] = useState<RowItem[]>([
    {
      productId: products[0]?.id ?? 0,
      qty: "1",
      unitPrice: products[0] ? String(products[0].sellPrice) : "0",
    },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const pickCustomer = (idStr: string) => {
    setCustomerId(idStr);
    const c = customers.find((x) => String(x.id) === idStr);
    if (c) {
      setCustomerName(c.name);
      setCustomerPhone(c.phone);
      // Use the saved area if it matches a known list, otherwise treat as custom
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

  // When the dispatcher clicks "Use this customer" on the inline match banner,
  // prefill name / phone / area / address from the matched row. We only fill
  // empty fields so we never overwrite something the user already typed.
  const applyMatch = (m: CustomerMatch) => {
    setCustomerId(String(m.id));
    if (!customerName.trim()) setCustomerName(m.name);
    if (!customerPhone.trim()) setCustomerPhone(m.phone);
    if (m.area) {
      if (DHAKA_AREAS_FLAT.some((a) => a.toLowerCase() === m.area.toLowerCase())) {
        if (!area || area === DHAKA_AREAS_FLAT[0]) {
          setArea(m.area);
          setCustomArea("");
        }
      } else {
        if (!customArea.trim()) {
          setArea("Other");
          setCustomArea(m.area);
        }
      }
    }
    if (!address.trim()) setAddress(m.address || "");
  };

  /** Auto-detect cluster / sub-cluster from the chosen area (or custom area).
   *  Updates live as the dispatcher types — gives instant visual feedback. */
  const detectedLocation = useMemo(() => {
    const resolvedArea = area === "Other" ? customArea.trim() : area;
    if (!resolvedArea) return null;
    return getLocationForArea(resolvedArea);
  }, [area, customArea]);

  const productById = (id: number) => products.find((p) => p.id === id);

  const rowsComputed = rows.map((r) => {
    const p = productById(r.productId);
    const qty = parseFloat(r.qty) || 0;
    const unitPrice = parseFloat(r.unitPrice) || 0;
    return { ...r, product: p, qty, unitPrice, lineTotal: qty * unitPrice };
  });

  const subtotal = rowsComputed.reduce((s, r) => s + r.lineTotal, 0);
  const freeDelivery = settings ? subtotal >= settings.freeDeliveryThreshold : false;
  const deliveryFee = freeDelivery ? 0 : settings?.deliveryCharge ?? 0;
  const discountVal = Math.max(0, parseFloat(discount) || 0);
  const total = Math.max(0, subtotal + deliveryFee - discountVal);

  const addRow = () => {
    const avail = products.find((p) => !rows.some((r) => r.productId === p.id));
    const nextProduct = avail ?? products[0];
    setRows([
      ...rows,
      {
        productId: nextProduct?.id ?? 0,
        qty: "1",
        unitPrice: nextProduct ? String(nextProduct.sellPrice) : "0",
      },
    ]);
  };

  const updateRow = (idx: number, field: keyof RowItem, value: string) => {
    const next = rows.map((r, i) => {
      if (i !== idx) return r;
      if (field === "productId") {
        const newId = Number(value);
        const p = productById(newId);
        return { ...r, productId: newId, unitPrice: p ? String(p.sellPrice) : r.unitPrice };
      }
      if (field === "qty") return { ...r, qty: value };
      if (field === "unitPrice") return { ...r, unitPrice: value };
      return r;
    });
    setRows(next);
  };

  const removeRow = (idx: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    setError("");
    if (rowsComputed.some((r) => !r.product)) {
      setError("Select a valid product for each row.");
      return;
    }
    if (rowsComputed.some((r) => r.qty <= 0)) {
      setError("Quantities must be greater than zero.");
      return;
    }
    if (!customerName.trim()) {
      setError("Customer name is required.");
      return;
    }
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
        qty: r.qty,
        unitPrice: r.unitPrice,
      })),
      deliveryFee,
      discount: discountVal,
      paid: parseFloat(paid) || 0,
      paymentMethod: paymentMethod as Order["paymentMethod"],
      source,
      deliveryMode,
      pathaoTrackingId: pathaoTrackingId.trim(),
      pathaoFare: parseFloat(pathaoFare) || 0,
      riderCost: parseFloat(riderCost) || 0,
      note,
    };
    setSaving(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      const order: Order = data.order;
      const savedCustomer: Customer | undefined = data.customer;
      onSaved();
      const noticeParts: string[] = [];
      if (data.customerSaved && savedCustomer) {
        noticeParts.push(`New customer saved: ${savedCustomer.name} (${savedCustomer.phone})`);
      } else if (data.customerUpdated && savedCustomer) {
        noticeParts.push(`Updated customer: ${savedCustomer.name} (${savedCustomer.phone})`);
      }
      if (noticeParts.length > 0) {
        setSavedNotice(noticeParts.join(" · "));
        setTimeout(() => {
          window.open(`/orders/${order.id}?print=1`, "_blank");
          onClose();
        }, 1200);
      } else {
        window.open(`/orders/${order.id}?print=1`, "_blank");
        onClose();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={embedded ? undefined : "modal-overlay"}
      onClick={embedded ? undefined : onClose}
      style={embedded ? { width: "100%" } : undefined}
    >
      <div
        className={embedded ? "card" : "modal-content"}
        onClick={(e) => e.stopPropagation()}
        style={embedded ? { padding: 20 } : { maxWidth: 860 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>New Order</h2>
          <button className="btn btn-secondary" onClick={onClose}><X size={15} /></button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label>Customer (existing)</label>
            <select value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
              <option value="">— New / walk-in —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Order Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label>Customer Name *</label>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <label>Phone</label>
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            <CustomerMatchBanner phone={customerPhone} onUse={applyMatch} />
          </div>
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
            {detectedLocation && detectedLocation.cluster && (
              <div
                title="Auto-detected from the area name; saved with the order"
                style={{
                  marginTop: 6,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  color: CLUSTER_COLORS[detectedLocation.cluster],
                  background: `${CLUSTER_COLORS[detectedLocation.cluster]}22`,
                  border: `1px solid ${CLUSTER_COLORS[detectedLocation.cluster]}55`,
                }}
              >
                <span style={{ fontWeight: 700 }}>{CLUSTER_SHORT[detectedLocation.cluster]}</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {detectedLocation.subCluster ? SUB_CLUSTER_LABELS[detectedLocation.subCluster as keyof typeof SUB_CLUSTER_LABELS] ?? detectedLocation.subCluster : "—"}
                </span>
              </div>
            )}
          </div>
          <div>
            <label>Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
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
                Hired Pathao Rider
              </button>
            </div>
          </div>
        </div>

        {deliveryMode === "pathao" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label>Pathao Tracking ID</label>
              <input value={pathaoTrackingId} onChange={(e) => setPathaoTrackingId(e.target.value)} placeholder="e.g. 7X-AB1234" />
            </div>
            <div>
              <label>Pathao Fare (৳)</label>
              <input type="number" min="0" step="1" value={pathaoFare} onChange={(e) => setPathaoFare(e.target.value)} />
            </div>
          </div>
        )}

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
                    <select value={r.productId} onChange={(e) => updateRow(idx, "productId", e.target.value)}>
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label>Subtotal</label>
            <div style={{ fontSize: 15, fontWeight: 600, paddingTop: 8 }}>{formatMoney(subtotal)}</div>
          </div>
          <div>
            <label>Delivery Fee {freeDelivery && <span style={{ color: "var(--accent-green)" }}>(free)</span>}</label>
            <div style={{ fontSize: 15, fontWeight: 600, paddingTop: 8 }}>{freeDelivery ? "FREE" : formatMoney(deliveryFee)}</div>
          </div>
          <div>
            <label>Flat Discount (�)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="0"
            />
            {discountVal > 0 && (
              <span style={{ fontSize: 11, color: "var(--accent-red)", marginTop: 4, display: "block" }}>
                -{formatMoney(discountVal)}
              </span>
            )}
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
            {parseFloat(riderCost) > 0 && (
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "block" }}>
                Rider payout
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <div>
            <label>Total</label>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--accent-green)", paddingTop: 4 }}>{formatMoney(total)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label>Payment Method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cod">Cash on Delivery</option>
              <option value="bkash">bKash</option>
              <option value="nagad">Nagad</option>
              <option value="card">Card</option>
              <option value="advance">Advance</option>
            </select>
          </div>
          <div>
            <label>Paid Amount (৳)</label>
            <input type="number" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} />
          </div>
          <div>
            <label>Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. good quality, cut into 5 pieces" />
          </div>
        </div>

        {error && <p style={{ color: "var(--accent-red)", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}

        {savedNotice && (
          <p style={{ color: "var(--accent-green)", fontSize: 13, margin: "0 0 12px" }}>{savedNotice}</p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Save & Print Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}