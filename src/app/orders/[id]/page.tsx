"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Printer, ArrowLeft, Bike, Receipt as ReceiptIcon, Edit3, Plus, Truck, FileText, TruckIcon } from "lucide-react";
import type { Order, Rider, Settings, Customer, Product } from "@/lib/types";
import type { DeliveryPartner, InvoiceFormat } from "@/lib/delivery-partners";
import { STATUS_LABELS, PAYMENT_LABELS, formatMoney, formatDateTime } from "@/lib/ui";
import { StatusBadge } from "@/components/status-badge";
import { StatusStepper } from "@/components/status-stepper";
import { EditOrderModal } from "@/components/edit-order-modal";
import { CancelOrderModal } from "@/components/cancel-order-modal";
import { ReturnOrderModal } from "@/components/return-order-modal";
import { BKASH_NUMBER } from "@/lib/bkash-qr";

// Print-specific CSS: forces the entire invoice onto one A4 page.
// Content is sized to fill the page (no big blank gap at the bottom)
// by stretching the signature/delivery-partner block to the bottom
// and making the QR large enough to be useful.
const PRINT_STYLES = `
@media print {
  @page { size: A4; margin: 4mm; }
  html, body {
    background: #fff !important;
    color: #000 !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .main-content { padding: 0 !important; max-width: 100% !important; }
  .permanent-header, .permanent-footer, .no-print { display: none !important; }
  .print-area {
    background: #fff !important;
    color: #000 !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
    page-break-inside: avoid !important;
    width: 100% !important;
    font-size: 8.5px !important;
    line-height: 1.15 !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: flex-start !important;
  }
  .print-area h1 { font-size: 14px !important; margin: 0 !important; }
  .print-area h2 { font-size: 10px !important; margin: 1px 0 !important; }
  .print-area p { margin: 0 !important; line-height: 1.15 !important; }
  .print-area table { font-size: 8px !important; width: 100% !important; }
  .print-area table th, .print-area table td { padding: 1px 3px !important; }
  /* Keep the QR at a scannable size. */
  .print-area img {
    max-width: 320px !important;
    max-height: 410px !important;
  }
  /* Tighter margins on the other content so the page fits. */
  .print-area > * { margin-top: 2px !important; margin-bottom: 2px !important; }
  .print-area > * > * { margin-top: 0 !important; margin-bottom: 0 !important; }
  /* Shrink the thank-you stamp when delivery partner is selected (to keep
     the page on one sheet with the partner card and the larger QR). */
  .print-area .invoice-thanks { padding: 4px 0 !important; font-size: 8px !important; }
  .print-area .invoice-thanks > div { font-size: 11px !important; margin-top: 1px !important; }
}
`;

export default function OrderDetail() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Loading...</div>}>
      <OrderDetailInner />
    </Suspense>
  );
}

function OrderDetailInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = Number(params.id);
  const autoPrint = searchParams.get("print") === "1";

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/orders");
    }
  };

  const [order, setOrder] = useState<Order | null>(null);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [printingPos, setPrintingPos] = useState(false);
  const [posMsg, setPosMsg] = useState<string>("");
  const [showEdit, setShowEdit] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  // Two invoice formats: standard, or with a delivery partner shown in
  // the footer. Default picks based on the order's own delivery mode.
  const [invoiceFormat, setInvoiceFormat] = useState<InvoiceFormat>("standard");
  const [partnerId, setPartnerId] = useState<string>("");
  // Whether the format/partner choice should follow the order's delivery
  // mode (auto: Pathao orders default to "partner" with Pathao).
  const [autoMode, setAutoMode] = useState<boolean>(true);

  const load = useCallback(async () => {
    try {
      const [o, r, s, p, c] = await Promise.all([
        fetch(`/api/orders/${id}`).then((r) => r.json()),
        fetch("/api/riders").then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json()),
        fetch("/api/products").then((r) => r.json()),
        fetch("/api/customers").then((r) => r.json()),
      ]);
      setOrder(o);
      setRiders(r);
      setSettings(s);
      setProducts(p);
      setCustomers(c);
      // Pick the invoice format & partner automatically based on the order's
      // delivery mode. The user can still override on the page.
      if (o.deliveryMode === "pathao" && (s.deliveryPartners?.length ?? 0) > 0) {
        setInvoiceFormat("partner");
        const pathao =
          s.deliveryPartners?.find((p: { name: string }) => /pathao/i.test(p.name)) ?? s.deliveryPartners?.[0];
        if (pathao) setPartnerId(pathao.id);
      } else {
        setInvoiceFormat("standard");
        if (s.defaultDeliveryPartnerId) setPartnerId(s.defaultDeliveryPartnerId);
      }
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

  // Auto-trigger browser print when the page is opened with ?print=1
  // (used by the order list "print" action and the new-order form's
  // post-submit "print" flow). We wait until the order is loaded so the
  // print preview actually has content; the small delay also lets the
  // print-area's images (bKash QR) finish painting.
  useEffect(() => {
    if (!autoPrint || loading || !order) return;
    const t = setTimeout(() => {
      try { window.print(); } catch { /* user dismissed */ }
    }, 400);
    return () => clearTimeout(t);
  }, [autoPrint, loading, order]);

  const update = async (body: object) => {
    await fetch(`/api/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  };

  const cancelOrder = async (reason: string) => {
    await update({ status: "cancelled", cancelReason: reason });
    setShowCancel(false);
  };

  const returnOrder = async (reason: string) => {
    await update({ status: "returned", returnReason: reason });
    setShowReturn(false);
  };

  const printPos = async () => {
    setPrintingPos(true);
    setPosMsg("");
    try {
      const res = await fetch(`/api/orders/${id}/print-pos`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Print failed");
      setPosMsg(`Sent to ${data.printerName}`);
      setTimeout(() => setPosMsg(""), 3000);
    } catch (e) {
      setPosMsg(String(e));
    } finally {
      setPrintingPos(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Loading...</div>;
  }

  if (!order) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Order not found.</div>;
  }

  const due = order.total - order.paid;
  const cancelled = order.status === "cancelled";

  return (
    <div>
      <style>{PRINT_STYLES}</style>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/orders" className="btn btn-secondary" onClick={(e) => { e.preventDefault(); goBack(); }}><ArrowLeft size={15} /></Link>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            {order.orderNo} <StatusBadge status={order.status} />
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {posMsg && (
            <span style={{ fontSize: 12, color: posMsg.startsWith("Failed") || posMsg.startsWith("Error") ? "var(--accent-red)" : "var(--accent-green)" }}>
              {posMsg}
            </span>
          )}
          <Link href="/orders/new" className="btn btn-secondary" style={{ textDecoration: "none" }}>
            <Plus size={15} /> New Order
          </Link>
          <button className="btn btn-secondary" onClick={() => setShowEdit(true)}>
            <Edit3 size={15} /> Edit
          </button>
          {!cancelled && (
            <>
              <button className="btn btn-amber" onClick={printPos} disabled={printingPos}>
                <ReceiptIcon size={15} /> {printingPos ? "Printing..." : "Print to POS"}
              </button>
              <button className="btn btn-primary" onClick={() => window.print()}>
                <Printer size={15} /> Print Invoice
              </button>
            </>
          )}
        </div>
      </div>

      {/* Invoice format toggle — Standard vs With Delivery Partner. */}
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
          padding: 10,
          background: "var(--bg-elevated, #1a1a1a)",
          border: "1px solid var(--border)",
          borderRadius: 6,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Invoice format:
        </div>
        <FormatToggle
          active={invoiceFormat}
          onChange={(f) => {
            setInvoiceFormat(f);
            if (f === "partner" && !partnerId) {
              const def =
                settings?.deliveryPartners?.find(
                  (p) => p.id === settings?.defaultDeliveryPartnerId,
                ) ?? settings?.deliveryPartners?.[0];
              if (def) setPartnerId(def.id);
            }
          }}
        />
        {invoiceFormat === "partner" &&
          (settings?.deliveryPartners?.length ?? 0) > 0 && (
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              style={{ fontSize: 12, padding: "4px 8px" }}
            >
              <option value="">— pick partner —</option>
              {settings?.deliveryPartners?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        {invoiceFormat === "partner" &&
          (settings?.deliveryPartners?.length ?? 0) === 0 && (
            <span style={{ fontSize: 11, color: "var(--accent-amber)" }}>
              ⚠ No delivery partners configured — add some in{" "}
              <Link href="/settings" style={{ color: "var(--accent-green)", textDecoration: "underline" }}>
                Settings
              </Link>
              .
            </span>
          )}
      </div>

      <div className="no-print" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px", color: "var(--text-secondary)", textTransform: "uppercase" }}>Status Flow</h2>
          <StatusStepper
            status={order.status}
            onChange={(s) => update({ status: s })}
            onRequestCancel={() => setShowCancel(true)}
            onRequestReturn={() => setShowReturn(true)}
          />
          {order.status === "delivered" && (
            <p style={{ fontSize: 12, color: "var(--accent-green)", margin: "12px 0 0" }}>
              Order completed. {formatMoney(order.total)} receivable from customer.
            </p>
          )}
          {order.status === "out-for-delivery" && (
            <p style={{ fontSize: 12, color: "var(--accent-amber)", margin: "12px 0 0" }}>
              Out for delivery. Stock has been deducted. Use <strong>Return</strong> if the order comes back undelivered.
            </p>
          )}
          {cancelled && (
            <p style={{ fontSize: 12, color: "var(--accent-red)", margin: "12px 0 0" }}>
              This order was cancelled. Stock has been restored.
              {order.cancelReason && (
                <>
                  <br />
                  <strong>Reason:</strong> {order.cancelReason}
                </>
              )}
            </p>
          )}
          {order.status === "returned" && (
            <p style={{ fontSize: 12, color: "#a78bfa", margin: "12px 0 0" }}>
              Order was returned after delivery. Stock has been restored.
              {order.returnReason && (
                <>
                  <br />
                  <strong>Reason:</strong> {order.returnReason}
                </>
              )}
            </p>
          )}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px", color: "var(--text-secondary)", textTransform: "uppercase" }}>
            <Bike size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
            Delivery
          </h2>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button
              onClick={() => update({ deliveryMode: "own" })}
              disabled={cancelled}
              className="btn"
              style={{
                flex: 1,
                fontSize: 12,
                background: order.deliveryMode === "own" ? "rgba(77,158,71,0.18)" : "var(--bg-primary)",
                color: order.deliveryMode === "own" ? "var(--accent-green)" : "var(--text-secondary)",
                border: `1px solid ${order.deliveryMode === "own" ? "rgba(77,158,71,0.4)" : "var(--border)"}`,
              }}
            >
              Own Rider
            </button>
            <button
              onClick={() => update({ deliveryMode: "pathao" })}
              disabled={cancelled}
              className="btn"
              style={{
                flex: 1,
                fontSize: 12,
                background: order.deliveryMode === "pathao" ? "rgba(232,163,61,0.18)" : "var(--bg-primary)",
                color: order.deliveryMode === "pathao" ? "var(--accent-amber)" : "var(--text-secondary)",
                border: `1px solid ${order.deliveryMode === "pathao" ? "rgba(232,163,61,0.4)" : "var(--border)"}`,
              }}
            >
              Hired Pathao
            </button>
          </div>

          {order.deliveryMode === "own" && (
            <>
              <select
                value={order.riderId ?? ""}
                onChange={(e) => update({ riderId: e.target.value ? Number(e.target.value) : null })}
                style={{ width: "100%" }}
                disabled={cancelled || order.status === "delivered"}
              >
                <option value="">— Unassigned —</option>
                {riders.filter((x) => x.status === "active" || x.id === order.riderId).map((r) => (
                  <option key={r.id} value={r.id}>{r.name} · {r.vehicle}</option>
                ))}
              </select>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "10px 0 0" }}>
                {order.riderId
                  ? `Assigned to ${riders.find((r) => r.id === order.riderId)?.name || "rider"}`
                  : "No rider assigned yet."
                }
              </p>
            </>
          )}

          {order.deliveryMode === "pathao" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label>Pathao Tracking ID</label>
                <input
                  value={order.pathaoTrackingId || ""}
                  onChange={(e) => update({ pathaoTrackingId: e.target.value })}
                  disabled={cancelled}
                  placeholder="e.g. 7X-AB1234"
                />
              </div>
              <div>
                <label>Pathao Fare (৳)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={String(order.pathaoFare || 0)}
                  onChange={(e) => update({ pathaoFare: parseFloat(e.target.value) || 0 })}
                  disabled={cancelled}
                />
              </div>
              <p style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
                This order is dispatched via Pathao. Pathao fare is your cost (not charged to customer).
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="print-area card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #000", paddingBottom: 12, marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Deshi Shadh</h2>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#444" }}>
              Fresh meat, doorstep delivery
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#444" }}>
              Merul Badda Near Kacha Bazar, Dhaka
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#444" }}>
              ☎ +880 1851-046310 · 🌐 deshishadhbd.com
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>INVOICE</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>{order.orderNo}</div>
            <div style={{ fontSize: 11, color: "#666" }}>
              Ordered: {formatDateTime(order.createdAt)}
            </div>
            <div style={{ fontSize: 12, color: "#444" }}>
              Confirmed: {order.confirmedAt ? formatDateTime(order.confirmedAt) : "—"}
            </div>
            {order.deliveredAt && (
              <div style={{ fontSize: 12, color: "#444" }}>
                Delivered: {formatDateTime(order.deliveredAt)}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Bill To</div>
            <div>{order.customerName}</div>
            <div>{order.customerPhone}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 600 }}>Delivery</div>
            <div>{order.area}</div>
            {order.deliveryMode === "pathao" ? (
              <>
                <div style={{ color: "#b45309" }}>Via Pathao</div>
                {order.pathaoTrackingId && <div>Tracking: {order.pathaoTrackingId}</div>}
              </>
            ) : (
              <div>{order.riderId ? `Rider: ${riders.find((r) => r.id === order.riderId)?.name || ""}` : ""}</div>
            )}
            <div style={{ fontStyle: "italic", color: "var(--accent-red)", fontWeight: 500 }}>{order.note}</div>
          </div>
        </div>

        {/* Address on its own row, full-width so it can wrap freely and
            never get clipped by the page edge. */}
        {(order.area || order.address) && (
          <div style={{ fontSize: 12, marginBottom: 12, wordBreak: "break-word", overflowWrap: "anywhere" }}>
            <span style={{ fontWeight: 600 }}>Address: </span>
            {order.area}{order.address ? ` — ${order.address}` : ""}
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #000" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Item</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Unit</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Qty</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Rate</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "6px 8px" }}>
                  {it.name}
                  {it.nameBn && <span style={{ color: "#666" }}> ({it.nameBn})</span>}
                </td>
                <td style={{ padding: "6px 8px" }}>{it.unit}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{it.qty}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{formatMoney(it.unitPrice)}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>{formatMoney(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <table style={{ fontSize: 12, borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ padding: "3px 12px 3px 0", color: "#444" }}>Subtotal</td>
                <td style={{ padding: "3px 0", textAlign: "right" }}>{formatMoney(order.subtotal)}</td>
              </tr>
              <tr>
                <td style={{ padding: "3px 12px 3px 0", color: "#444" }}>Delivery Fee</td>
                <td style={{ padding: "3px 0", textAlign: "right" }}>{order.deliveryFee > 0 ? formatMoney(order.deliveryFee) : "FREE"}</td>
              </tr>
              {order.discount > 0 && (
                <tr>
                  <td style={{ padding: "3px 12px 3px 0", color: "#444" }}>Discount</td>
                  <td style={{ padding: "3px 0", textAlign: "right" }}>-{formatMoney(order.discount)}</td>
                </tr>
              )}
              <tr style={{ borderTop: "1.5px solid #000" }}>
                <td style={{ padding: "6px 12px 6px 0", fontWeight: 700 }}>Total</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700, fontSize: 14 }}>{formatMoney(order.total)}</td>
              </tr>
              <tr>
                <td style={{ padding: "3px 12px 3px 0", color: "#444" }}>Paid ({PAYMENT_LABELS[order.paymentMethod]})</td>
                <td style={{ padding: "3px 0", textAlign: "right", color: due <= 0 ? "#166534" : "#b45309", fontWeight: 600 }}>
                  {formatMoney(order.paid)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "3px 12px 3px 0", fontWeight: 600 }}>Due</td>
                <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 700, color: due > 0 ? "#b91c1c" : "#166534" }}>
                  {formatMoney(due)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bkash payment — QR with a thick pink frame. */}
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "center",
            maxWidth: 520,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <img
            src="/bkash-qr.png"
            alt="bKash Payment QR"
            style={{
              width: "100%",
              maxWidth: 520,
              height: "auto",
              aspectRatio: "612 / 780",
              display: "block",
              border: "4px solid #9d174d",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Signature block — rider signs on paper at delivery */}
        <div
          style={{
            marginTop: 8,
            paddingTop: 6,
            borderTop: "1px solid #000",
            fontSize: 9,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 2, fontSize: 10 }}>DELIVERY CONFIRMATION</div>
          <div style={{ color: "#444", marginBottom: 4, fontStyle: "italic" }}>
            I confirm the items were delivered fresh and in good condition. Signing below, the rider accepts responsibility for delivery.
          </div>
          <div style={{ maxWidth: 360 }}>
            <div style={{ color: "#444", fontSize: 9, marginBottom: 1 }}>Delivered by (rider signature)</div>
            <div style={{ borderBottom: "1px solid #000", height: 22 }}></div>
          </div>
        </div>

        {/* Delivery partner footer — only shown when the "With Delivery
            Partner" format is selected and a partner is picked. */}
        {invoiceFormat === "partner" && partnerId && (() => {
          const partner = settings?.deliveryPartners?.find((p) => p.id === partnerId);
          if (!partner) return null;
          return (
            <DeliveryPartnerBlock
              partner={partner}
              tracking={order.deliveryMode === "pathao" ? order.pathaoTrackingId : undefined}
            />
          );
        })()}

        {/* Thank-you stamp — always shown at the bottom of the invoice,
            right after the last content block (signature or delivery
            partner). With "With Delivery Partner" selected, it sits below
            the partner card. */}
        <div
          className="invoice-thanks"
          style={{
            marginTop: 14,
            paddingTop: 10,
            borderTop: "1px dashed #999",
            textAlign: "center",
            color: "#555",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 800, color: "#9d174d", letterSpacing: 1 }}>
            Thank you for your order!
          </div>
          <div style={{ fontSize: 11, marginTop: 2 }}>
            For questions or reorder: ☎ +880 1851-046310 · 🌐 deshishadhbd.com
          </div>
          <div style={{ fontSize: 10, marginTop: 2, fontStyle: "italic" }}>
            {settings?.invoiceNote || "Fresh meat, doorstep delivery."}
          </div>
        </div>
      </div>

      <div className="no-print card" style={{ padding: 16 }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          {settings?.invoiceNote} · Created {formatDateTime(order.createdAt)} · Status: {STATUS_LABELS[order.status]}
        </p>
      </div>

      {showEdit && (
        <EditOrderModal
          order={order}
          products={products}
          customers={customers}
          onClose={() => setShowEdit(false)}
          onSaved={load}
        />
      )}

      <CancelOrderModal
        open={showCancel}
        orderNo={order.orderNo}
        onClose={() => setShowCancel(false)}
        onConfirm={cancelOrder}
      />
      <ReturnOrderModal
        open={showReturn}
        orderNo={order.orderNo}
        onClose={() => setShowReturn(false)}
        onConfirm={returnOrder}
      />
    </div>
  );
}

/** Two-option toggle (Standard / With Delivery Partner). */
function FormatToggle({
  active,
  onChange,
}: {
  active: InvoiceFormat;
  onChange: (f: InvoiceFormat) => void;
}) {
  const opts: Array<{ value: InvoiceFormat; label: string; icon: React.ReactNode }> = [
    { value: "standard", label: "Standard", icon: <FileText size={12} /> },
    { value: "partner", label: "With Delivery Partner", icon: <TruckIcon size={12} /> },
  ];
  return (
    <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "5px 10px",
            fontSize: 12,
            fontWeight: 600,
            background: active === o.value ? "var(--accent-green)" : "transparent",
            color: active === o.value ? "#fff" : "var(--text-secondary)",
            border: "none",
            cursor: "pointer",
          }}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Render the selected delivery partner inside the invoice footer. */
function DeliveryPartnerBlock({ partner, tracking }: { partner: DeliveryPartner; tracking?: string }) {
  return (
    <div
      style={{
        marginTop: 14,
        padding: 12,
        background: "var(--bg-elevated, #1a1a1a)",
        border: "1px solid var(--border)",
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "var(--text-muted)",
          marginBottom: 4,
        }}
      >
        Delivery Partner
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--accent-green)" }}>
        {partner.name}
      </div>
      {tracking && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace" }}>
          Tracking: {tracking}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4, fontSize: 12 }}>
        {partner.phone && <div>☎ {partner.phone}</div>}
        {partner.website && (
          <div>
            🌐{" "}
            <span style={{ color: "var(--accent-green)" }}>{partner.website}</span>
          </div>
        )}
      </div>
      {partner.notes && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>
          {partner.notes}
        </div>
      )}
    </div>
  );
}