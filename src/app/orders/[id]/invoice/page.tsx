import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getOrder,
  getRiders,
  getSettings,
  getProducts,
} from "@/lib/db";
import { PAYMENT_LABELS, formatMoney, formatDateTime } from "@/lib/ui";
import { ADMIN_MODE_COOKIE } from "@/lib/tenant-constants";
import { InvoicePrintButton } from "./invoice-print-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return {
    title: `Invoice ${id} — Dropify`,
  };
}

const PRINT_STYLES = `
@page { size: A4; margin: 4mm; }
@media print {
  html, body {
    background: #fff !important;
    color: #000 !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .mobile-toolbar { display: none !important; }
  .invoice-shell { padding: 0 !important; max-width: 100% !important; }
  .invoice-card { background: #fff !important; color: #000 !important; border: none !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; }
  .invoice-card { font-size: 8.5px !important; line-height: 1.15 !important; display: flex !important; flex-direction: column !important; justify-content: flex-start !important; page-break-inside: avoid !important; width: 100% !important; }
  .invoice-card h1 { font-size: 14px !important; margin: 0 !important; }
  .invoice-card h2 { font-size: 10px !important; margin: 1px 0 !important; }
  .invoice-card p { margin: 0 !important; line-height: 1.15 !important; }
  .invoice-card table { font-size: 8px !important; width: 100% !important; }
  .invoice-card table th, .invoice-card table td { padding: 1px 3px !important; }
  .invoice-card img { max-width: 320px !important; max-height: 410px !important; }
  .invoice-card > * { margin-top: 2px !important; margin-bottom: 2px !important; }
  .invoice-card > * > * { margin-top: 0 !important; margin-bottom: 0 !important; }
  .invoice-card .invoice-thanks { padding: 4px 0 !important; font-size: 8px !important; }
  .invoice-card .invoice-thanks > div { font-size: 11px !important; margin-top: 1px !important; }
}
`;

const MOBILE_TOOLBAR_STYLES = `
.mobile-toolbar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--color-bg-elevated, #1d2420);
  border-bottom: 1px solid var(--border);
  margin: -16px -16px 14px;
  font-size: 13px;
}
.mobile-toolbar strong { color: var(--color-text-primary); }
.mobile-toolbar .spacer { flex: 1; }
`;

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const orderId = Number(idParam);
  if (!Number.isInteger(orderId)) notFound();

  // Server-side admin auth gate. The proxy already blocks rider sessions;
  // this stops non-admin operators too.
  const cookieStore = await cookies();
  if (cookieStore.get(ADMIN_MODE_COOKIE)?.value !== "1") {
    redirect(`/orders/${orderId}`);
  }

  const companyId = cookieStore.get("active_company_id")?.value
    ? Number(cookieStore.get("active_company_id")?.value)
    : 1;
  if (!Number.isFinite(companyId)) notFound();

  const [order, riders, settings] = await Promise.all([
    Promise.resolve(getOrder(orderId, companyId)),
    Promise.resolve(getRiders()),
    Promise.resolve(getSettings(companyId)),
  ]);
  if (!order) notFound();

  // products + customers not strictly needed for the invoice but are
  // cheap to fetch and keep the page consistent if we later want to
  // reference unit prices or customer credit
  void getProducts(companyId);

  const due = order.total - order.paid;
  const cancelled = order.status === "cancelled";
  const riderName =
    order.riderId ? riders.find((r) => r.id === order.riderId)?.name ?? "" : "";

  return (
    <>
      <style>{PRINT_STYLES}</style>
      <style>{MOBILE_TOOLBAR_STYLES}</style>
      <div
        className="invoice-shell"
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: 16,
        }}
      >
        <div className="mobile-toolbar no-print">
          <Link
            href={`/orders/${orderId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: "var(--color-text-primary)",
              textDecoration: "none",
              fontSize: 13,
              minHeight: 44,
            }}
          >
            <ArrowLeft size={14} /> Back
          </Link>
          <span className="spacer" />
          <strong style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>{order.orderNo}</strong>
          <span className="spacer" style={{ flex: 1 }} />
          <InvoicePrintButton />
        </div>

        <div
          className="invoice-card"
          style={{
            background: "var(--bg-card, #fff)",
            color: "var(--color-text, #111)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 20,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderBottom: "2px solid var(--color-text, #111)",
              paddingBottom: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                {settings?.businessName || ""}
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-text-secondary, #444)" }}>
                {settings?.tagline || ""}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--color-text-secondary, #444)" }}>
                Merul Badda Near Kacha Bazar, Dhaka
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--color-text-secondary, #444)" }}>
                ☎ {settings?.phone || ""} · 🌐 deshishadhbd.com
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>INVOICE</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{order.orderNo}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary, #666)" }}>
                Ordered: {formatDateTime(order.createdAt)}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary, #444)" }}>
                Confirmed: {order.confirmedAt ? formatDateTime(order.confirmedAt) : "—"}
              </div>
              {order.deliveredAt && (
                <div style={{ fontSize: 12, color: "var(--color-text-secondary, #444)" }}>
                  Delivered: {formatDateTime(order.deliveredAt)}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
              fontSize: 12,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
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
                  <div style={{ color: "var(--color-warning, #b45309)" }}>Via Pathao</div>
                  {order.pathaoTrackingId && <div>Tracking: {order.pathaoTrackingId}</div>}
                </>
              ) : (
                <div>{riderName ? `Rider: ${riderName}` : ""}</div>
              )}
              <div
                style={{
                  fontStyle: "italic",
                  color: "var(--color-danger, #b91c1c)",
                  fontWeight: 500,
                }}
              >
                {order.note}
              </div>
            </div>
          </div>

          {(order.area || order.address) && (
            <div
              style={{
                fontSize: 12,
                marginBottom: 12,
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              <span style={{ fontWeight: 600 }}>Address: </span>
              {order.area}
              {order.address ? ` — ${order.address}` : ""}
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
                    {it.nameBn && (
                      <span style={{ color: "#666" }}> ({it.nameBn})</span>
                    )}
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
                  <td style={{ padding: "3px 0", textAlign: "right" }}>
                    {order.deliveryFee > 0 ? formatMoney(order.deliveryFee) : "FREE"}
                  </td>
                </tr>
                {order.discount > 0 && (
                  <tr>
                    <td style={{ padding: "3px 12px 3px 0", color: "#444" }}>Discount</td>
                    <td style={{ padding: "3px 0", textAlign: "right" }}>-{formatMoney(order.discount)}</td>
                  </tr>
                )}
                <tr style={{ borderTop: "1.5px solid #000" }}>
                  <td style={{ padding: "6px 12px 6px 0", fontWeight: 700 }}>Total</td>
                  <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700, fontSize: 14 }}>
                    {formatMoney(order.total)}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "3px 12px 3px 0", color: "#444" }}>
                    Paid ({PAYMENT_LABELS[order.paymentMethod]})
                  </td>
                  <td
                    style={{
                      padding: "3px 0",
                      textAlign: "right",
                      color: due <= 0 ? "#166534" : "#b45309",
                      fontWeight: 600,
                    }}
                  >
                    {formatMoney(order.paid)}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "3px 12px 3px 0", fontWeight: 600 }}>Due</td>
                  <td
                    style={{
                      padding: "3px 0",
                      textAlign: "right",
                      fontWeight: 700,
                      color: due > 0 ? "#b91c1c" : "#166534",
                    }}
                  >
                    {formatMoney(due)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

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
              For questions or reorder: ☎ {settings?.phone || ""} · 🌐 deshishadhbd.com
            </div>
            <div style={{ fontSize: 10, marginTop: 2, fontStyle: "italic" }}>
              {settings?.invoiceNote || settings?.tagline || ""}
            </div>
          </div>
        </div>

        <div
          className="no-print"
          style={{
            marginTop: 16,
            display: "flex",
            gap: 8,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <InvoicePrintButton />
        </div>

        <div
          className="no-print"
          style={{
            marginTop: 12,
            padding: "12px 16px",
            background: "var(--bg-elevated, #1d2420)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontSize: 12,
            color: "var(--color-text-secondary, #444)",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "var(--color-text, #111)", display: "block", marginBottom: 4 }}>
            Mobile share tip
          </strong>
          On iPhone: tap the green button → tap the share icon → choose
          &quot;Save to Files&quot; or &quot;Print&quot;. On Android: same — the
          button opens the system print sheet, where you can save as PDF
          or send to a printer. The printed output is exactly what you see
          on this page, sized to fit a single A4 sheet.
        </div>
      </div>
    </>
  );
}