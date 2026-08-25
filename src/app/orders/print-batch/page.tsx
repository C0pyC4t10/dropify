"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Order, Rider, Settings } from "@/lib/types";
import { formatMoney } from "@/lib/ui";

export default function PrintBatchPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading...</div>}>
      <PrintBatchPage />
    </Suspense>
  );
}

function PrintBatchPage() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get("ids") || "";
  const ids = useMemo(
    () =>
      idsParam
        .split(",")
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n) && n > 0),
    [idsParam]
  );

  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ids.length === 0) return;
    (async () => {
      try {
        const fetched = await Promise.all([
          ...ids.map((id) => fetch(`/api/orders/${id}`).then((r) => r.json())),
          fetch("/api/riders").then((r) => r.json()),
          fetch("/api/settings").then((r) => r.json()),
        ]);
        const fetchedOrders = fetched.slice(0, ids.length).filter((o) => o && o.id);
        setOrders(fetchedOrders);
        setRiders(fetched[ids.length] as Rider[]);
        setSettings(fetched[ids.length + 1] as Settings);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [idsParam]);

  // Auto-print once loaded
  useEffect(() => {
    if (!loading && orders.length > 0) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [loading, orders.length]);

  /** Page chunks of 8 orders each — 8 per printed A4 page (2 cols x 4 rows). */
  const pageChunks = useMemo(() => {
    const chunks: Order[][] = [];
    for (let i = 0; i < orders.length; i += 8) chunks.push(orders.slice(i, i + 8));
    return chunks;
  }, [orders]);

  /** Per-chunk totals shown at the bottom of each printed page. */
  const chunkTotals = useMemo(() => {
    return pageChunks.map((chunk) => {
      let value = 0;
      let collected = 0;
      let cod = 0;
      let count = 0;
      let cancelled = 0;
      for (const o of chunk) {
        if (o.status === "cancelled") {
          cancelled += 1;
          continue;
        }
        count += 1;
        value += o.total;
        collected += o.paid;
        cod += Math.max(0, o.total - o.paid);
      }
      return { value, collected, cod, count, cancelled };
    });
  }, [pageChunks]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        Loading {ids.length} orders…
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p>No orders selected.</p>
        <button className="btn btn-secondary no-print" onClick={() => window.close()}>
          Close
        </button>
      </div>
    );
  }

  const totalAll = orders.reduce((s, o) => s + o.total, 0);
  const paidAll = orders.reduce((s, o) => s + o.paid, 0);
  const dueAll = orders.reduce((s, o) => s + Math.max(0, o.total - o.paid), 0);
  // Bangladesh timezone (UTC+6) — server runs in UTC, so we shift manually
  const now = new Date();
  const bdTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const printedDateStr = bdTime.toISOString().slice(0, 10);
  const printedTimeStr = bdTime.toISOString().slice(11, 16);

  return (
    <div>
      <style>{`
        @page { size: A4; margin: 10mm; }
        .order-card {
          border: 1.5px solid #000;
          border-radius: 6px;
          padding: 10px 12px;
          font-size: 11px;
          line-height: 1.35;
          break-inside: avoid;
          page-break-inside: avoid;
          color: #000;
          background: #fff;
        }
        .order-card table { font-size: 11px; }
        .order-card th, .order-card td { padding: 1px 4px; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .page-chunk { gap: 6px !important; }
        }
      `}</style>

      <div
        className="no-print"
        style={{
          padding: 12,
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <strong>Batch Print · {orders.length} orders</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => window.print()}>
            Print
          </button>
          <button className="btn btn-secondary" onClick={() => window.close()}>
            Close
          </button>
        </div>
      </div>

      <div style={{ padding: 12 }}>
        <h1 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 4px" }}>
          {settings?.businessName || "Bazarey Ltd"} — Batch Delivery Sheet
        </h1>
        <p style={{ margin: "0 0 10px", fontSize: 11, color: "#444" }}>
          Printed {printedDateStr} {printedTimeStr} · {orders.length} orders ·{" "}
          {pageChunks.length} {pageChunks.length === 1 ? "page" : "pages"}
        </p>

        {pageChunks.map((chunk, chunkIdx) => {
          const isLastChunk = chunkIdx === pageChunks.length - 1;
          const startIdx = chunkIdx * 8;
          const t = chunkTotals[chunkIdx];
          return (
            <section
              key={chunkIdx}
              className="page-chunk"
              style={{
                pageBreakAfter: isLastChunk ? "auto" : "always",
                breakAfter: isLastChunk ? "auto" : "page",
                marginBottom: 12,
              }}
            >
              {/* Page sub-header — same style as footer */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 12px",
                  background: "#000",
                  color: "#fff",
                  borderRadius: 4,
                  marginBottom: 8,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <span>
                  Page {chunkIdx + 1} of {pageChunks.length}
                </span>
                <span>
                  Orders {startIdx + 1}–{startIdx + chunk.length} of {orders.length}
                </span>
              </div>

              {/* 2x4 grid of 8 order cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                {chunk.map((o, idx) => {
                  const globalIdx = startIdx + idx;
                  const cod = Math.max(0, o.total - o.paid);
                  return (
                    <div key={o.id} className="order-card">
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          borderBottom: "1px solid #000",
                          paddingBottom: 3,
                          marginBottom: 4,
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: 12 }}>
                          {globalIdx + 1}. {o.orderNo}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            color:
                              o.status === "delivered"
                                ? "#166534"
                                : o.status === "cancelled"
                                ? "#b91c1c"
                                : "#1d4ed8",
                          }}
                        >
                          {o.status}
                        </div>
                      </div>

                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: 11 }}>{o.customerName}</div>
                        <div style={{ color: "#444" }}>
                          {o.customerPhone}
                          {o.area ? ` · ${o.area}` : ""}
                        </div>
                        {o.address && (
                          <div style={{ color: "#555", fontSize: 9, lineHeight: 1.25 }}>
                            {o.address}
                          </div>
                        )}
                        {o.deliveryMode === "pathao" && (
                          <div style={{ color: "#b45309", fontWeight: 600 }}>
                            Pathao{o.pathaoTrackingId ? ` · ${o.pathaoTrackingId}` : ""}
                          </div>
                        )}
                      </div>

                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          marginBottom: 4,
                        }}
                      >
                        <tbody>
                          {o.items.map((it, i) => (
                            <tr key={i}>
                              <td style={{ padding: "1px 4px" }}>
                                <strong>{it.qty}</strong>
                                {it.unit === "kg" ? "kg" : "pc"} {it.name}
                                {it.nameBn && (
                                  <span style={{ color: "#888" }}> ({it.nameBn})</span>
                                )}
                              </td>
                              <td style={{ padding: "1px 4px", textAlign: "right" }}>
                                × {formatMoney(it.unitPrice)}
                              </td>
                              <td
                                style={{
                                  padding: "1px 4px",
                                  textAlign: "right",
                                  fontWeight: 700,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                = {formatMoney(it.lineTotal)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          borderTop: "1px solid #000",
                          paddingTop: 3,
                          fontSize: 11,
                        }}
                      >
                        <div>
                          <span style={{ color: "#555" }}>Paid </span>
                          <strong>{formatMoney(o.paid)}</strong>
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>
                          {formatMoney(o.total)}
                        </div>
                        {cod > 0 && o.status !== "delivered" && (
                          <div style={{ color: "#b91c1c", fontWeight: 700 }}>
                            COD {formatMoney(cod)}
                          </div>
                        )}
                        {o.status === "delivered" && (
                          <div style={{ color: "#166534", fontWeight: 700 }}>PAID</div>
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginTop: 3,
                          fontSize: 9,
                          color: "#444",
                        }}
                      >
                        <div>
                          Rider:{" "}
                          {o.deliveryMode === "pathao"
                            ? "Pathao"
                            : o.riderId
                            ? riders.find((r) => r.id === o.riderId)?.name ?? `#${o.riderId}`
                            : "Unassigned"}
                        </div>
                        {o.note && (
                          <div
                            style={{
                              color: "#b91c1c",
                              fontStyle: "italic",
                              maxWidth: "55%",
                              textAlign: "right",
                            }}
                          >
                            {o.note}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Per-page totals — same style as header */}
              <div
                style={{
                  marginTop: 8,
                  padding: "6px 12px",
                  background: "#000",
                  color: "#fff",
                  borderRadius: 4,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                <strong>
                  Page {chunkIdx + 1} totals · {t.count}{" "}
                  {t.count === 1 ? "order" : "orders"}
                  {t.cancelled > 0 ? ` (+${t.cancelled} cancelled)` : ""}
                </strong>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  Value {formatMoney(t.value)} · Paid {formatMoney(t.collected)} ·{" "}
                  <strong>COD {formatMoney(t.cod)}</strong>
                </span>
              </div>
            </section>
          );
        })}

        {/* Grand total — only on the very last page */}
        <div
          style={{
            marginTop: 16,
            padding: 10,
            border: "2px solid #000",
            borderRadius: 4,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          <span>
            Grand Total · {orders.length} orders · {pageChunks.length}{" "}
            {pageChunks.length === 1 ? "page" : "pages"}
          </span>
          <span>
            {formatMoney(totalAll)} · Paid {formatMoney(paidAll)} · Due {formatMoney(dueAll)}
          </span>
        </div>

        {/* bKash Payment — uses the static QR image at /bkash-qr.png */}
        <BatchBkashQr />
      </div>
    </div>
  );
}

function BatchBkashQr() {
  return (
    <div
      style={{
        marginTop: 14,
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
  );
}