"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "@/types/next";
import { Printer, ArrowLeft, Bike, Download, CalendarRange } from "lucide-react";
import type { Rider, Order } from "@/lib/types";
import { formatMoney } from "@/lib/ui";

/** BD-time YYYY-MM-DD for "today" */
function bdToday(): string {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Convert any ISO timestamp (UTC) to its YYYY-MM-DD in BD time. */
function isoToBDDate(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  return new Date(t + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shiftBD(dateIso: string, days: number): string {
  const d = new Date(dateIso + "T12:00:00");
  d.setDate(d.getDate() + days);
  const bd = new Date(d.getTime() + 6 * 60 * 60 * 1000);
  return bd.toISOString().slice(0, 10);
}

function formatDateLabel(iso: string): { full: string; short: string; weekday: string } {
  const d = new Date(iso + "T12:00:00");
  const full = d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const short = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" });
  return { full, short, weekday };
}

function ManifestContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const riderId = Number(params.id);
  const queryDate = search?.get("date") || bdToday();
  const queryFrom = search?.get("from");
  const queryTo = search?.get("to");

  const [rider, setRider] = useState<Rider | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState<string>(queryFrom || queryDate);
  const [to, setTo] = useState<string>(queryTo || queryDate);

  useEffect(() => {
    (async () => {
      try {
        const [r, o] = await Promise.all([
          fetch("/api/riders").then((r) => r.json()),
          fetch("/api/orders").then((r) => r.json()),
        ]);
        const found = (r as Rider[]).find((x) => x.id === riderId) || null;
        setRider(found);
        setOrders(o as Order[]);
      } finally {
        setLoading(false);
      }
    })();
  }, [riderId]);

  const ownOrders = useMemo(
    () => orders.filter((o) => o.riderId === riderId && o.deliveryMode !== "pathao"),
    [orders, riderId],
  );

  const inRange = useMemo(() => {
    return ownOrders
      .filter((o) => {
        const ts =
          o.deliveredAt ||
          (o.riderId === riderId ? o.updatedAt : "") ||
          o.confirmedAt ||
          o.createdAt;
        if (!ts) return false;
        const day = isoToBDDate(ts);
        return day >= from && day <= to;
      })
      .sort((a, b) => {
        const key = (o: Order) =>
          o.deliveredAt || (o.riderId === riderId ? o.updatedAt : "") || o.confirmedAt || o.createdAt;
        return key(a).localeCompare(key(b));
      });
  }, [ownOrders, from, to]);

  /** Group consecutive same-day orders so we can show a date label per card. */
  const dayOf = (o: Order) =>
    isoToBDDate(
      o.deliveredAt || (o.riderId === riderId ? o.updatedAt : "") || o.confirmedAt || o.createdAt,
    );

  /** Page chunks of 8 orders each — 8 per printed A4 page (2 cols x 4 rows). */
  const pageChunks = useMemo(() => {
    const chunks: Order[][] = [];
    for (let i = 0; i < inRange.length; i += 8) chunks.push(inRange.slice(i, i + 8));
    return chunks;
  }, [inRange]);

  /** Per-chunk totals — shown at the bottom of each printed page. */
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

  const grandTotals = useMemo(() => {
    let totalValue = 0;
    let totalCollected = 0;
    let totalCOD = 0;
    let orderCount = 0;
    let deliveredCount = 0;
    let cancelledCount = 0;
    for (const o of inRange) {
      if (o.status === "cancelled") {
        cancelledCount += 1;
        continue;
      }
      orderCount += 1;
      totalValue += o.total;
      totalCollected += o.paid;
      totalCOD += Math.max(0, o.total - o.paid);
      if (o.status === "delivered") deliveredCount += 1;
    }
    return { totalValue, totalCollected, totalCOD, orderCount, deliveredCount, cancelledCount };
  }, [inRange]);

  // Auto-print once data is loaded
  useEffect(() => {
    if (!loading && rider && search?.get("autoprint") === "1") {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [loading, rider, search]);

  const updateRange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    const url = new URL(window.location.href);
    if (nextFrom === nextTo) {
      url.searchParams.set("date", nextFrom);
      url.searchParams.delete("from");
      url.searchParams.delete("to");
    } else {
      url.searchParams.set("from", nextFrom);
      url.searchParams.set("to", nextTo);
      url.searchParams.delete("date");
    }
    window.history.replaceState(null, "", url.toString());
  };

  const setQuickRange = (range: "today" | "yesterday" | "last7" | "thismonth" | "all") => {
    const today = bdToday();
    if (range === "today") updateRange(today, today);
    else if (range === "yesterday") {
      const y = shiftBD(today, -1);
      updateRange(y, y);
    } else if (range === "last7") updateRange(shiftBD(today, -6), today);
    else if (range === "thismonth") {
      const monthStart = today.slice(0, 8) + "01";
      updateRange(monthStart, today);
    } else if (range === "all") {
      const earliest = ownOrders
        .map((o) => (o.confirmedAt || o.createdAt).slice(0, 10))
        .filter(Boolean)
        .sort()[0] || today;
      updateRange(earliest, today);
    }
  };

  const downloadCSV = () => {
    if (!rider || inRange.length === 0) return;
    const lines: string[] = [];
    lines.push(
      [
        "Date",
        "Order #",
        "Customer",
        "Phone",
        "Area",
        "Address",
        "Items",
        "Status",
        "Total (BDT)",
        "Paid",
        "COD Due",
        "Note",
      ].join(","),
    );
    for (const o of inRange) {
      const cod = Math.max(0, o.total - o.paid);
      const items = o.items.map((it) => `${it.qty}${it.unit === "kg" ? "kg" : "pc"} ${it.name}`).join("; ");
      const address = [o.area, o.address].filter(Boolean).join(" — ");
      const cell = (v: unknown) => {
        const s = String(v ?? "").replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      };
      lines.push(
        [
          dayOf(o),
          o.orderNo,
          o.customerName,
          o.customerPhone,
          o.area,
          address,
          items,
          o.status,
          o.total,
          o.paid,
          cod,
          o.note,
        ]
          .map(cell)
          .join(","),
      );
    }
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `manifest-${rider.name.replace(/\s+/g, "-").toLowerCase()}-${from}_to_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Loading manifest...</div>;
  }

  if (!rider) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>Rider not found.</p>
        <Link href="/riders" className="btn btn-primary">
          <ArrowLeft size={14} /> Back
        </Link>
      </div>
    );
  }

  const rangeLabel =
    from === to
      ? formatDateLabel(from).full
      : `${formatDateLabel(from).short} → ${formatDateLabel(to).short}`;

  return (
    <div>
      {/* On-screen toolbar (hidden in print) */}
      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <Link
          href={`/riders/${riderId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            color: "var(--text-secondary)",
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={14} /> Back to rider
        </Link>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <CalendarRange size={14} color="var(--text-muted)" />
          <input
            type="date"
            value={from}
            onChange={(e) => updateRange(e.target.value, e.target.value > to ? e.target.value : to)}
            style={{ width: "auto" }}
          />
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>to</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => updateRange(e.target.value < from ? e.target.value : from, e.target.value)}
            style={{ width: "auto" }}
          />
          <button type="button" onClick={() => setQuickRange("today")} className="btn btn-secondary" style={{ fontSize: 11, padding: "6px 10px" }}>
            Today
          </button>
          <button type="button" onClick={() => setQuickRange("last7")} className="btn btn-secondary" style={{ fontSize: 11, padding: "6px 10px" }}>
            7 days
          </button>
          <button type="button" onClick={() => setQuickRange("thismonth")} className="btn btn-secondary" style={{ fontSize: 11, padding: "6px 10px" }}>
            Month
          </button>
          <button type="button" onClick={() => setQuickRange("all")} className="btn btn-secondary" style={{ fontSize: 11, padding: "6px 10px" }}>
            All
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={downloadCSV} className="btn btn-secondary" disabled={inRange.length === 0}>
            <Download size={13} /> CSV
          </button>
          <button type="button" onClick={() => window.print()} className="btn btn-primary">
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      {/* Manifest sheet — printable area */}
      <div className="print-area card" style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
        {/* Brand header — printed on every page so context is preserved */}
        <div
          className="brand-header"
          style={{
            textAlign: "center",
            marginBottom: 12,
            paddingBottom: 10,
            borderBottom: "2px solid #000",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800, color: "#000", marginBottom: 2 }}>Bazarey Ltd</div>
          <div style={{ fontSize: 11, color: "#555" }}>Meat Delivery Operations · 01932367356</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: "#000" }}>
            DELIVERY MANIFEST · {rangeLabel}
          </div>
          <div style={{ fontSize: 11, color: "#000" }}>
            Rider: <strong>{rider.name}</strong> · {rider.phone} · {rider.vehicle}
          </div>
        </div>

        {/* Page chunks — 4 orders per page (2x2 grid). Each chunk is its own
            printed page; page-break-after forces a break between chunks. */}
        {inRange.length === 0 ? (
          <p style={{ textAlign: "center", padding: 20, color: "#555", fontSize: 13 }}>
            No orders assigned to this rider between {formatDateLabel(from).short} and {formatDateLabel(to).short}.
          </p>
        ) : (
          pageChunks.map((chunk, chunkIdx) => {
            const isLastChunk = chunkIdx === pageChunks.length - 1;
            const startIdx = chunkIdx * 8;
            // Show the dates covered by this chunk in a small sub-header
            const chunkDates = Array.from(new Set(chunk.map(dayOf))).map(formatDateLabel);
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
                {/* Chunk sub-header — same dark style as the footer */}
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
                    Page {chunkIdx + 1} of {pageChunks.length} ·{" "}
                    {chunkDates.length === 1
                      ? chunkDates[0].full
                      : `${chunkDates[0].short} → ${chunkDates[chunkDates.length - 1].short}`}
                  </span>
                  <span>
                    Orders {startIdx + 1}–{startIdx + chunk.length} of {inRange.length}
                  </span>
                </div>

                {/* 2x2 grid of 4 order cards */}
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
                    const items = o.items
                      .map((it) => `${it.qty}${it.unit === "kg" ? "kg" : "pc"} ${it.name}`)
                      .join(", ");
                    const address = [o.area, o.address].filter(Boolean).join(" — ");
                    const isCancelled = o.status === "cancelled";
                    const lbl = formatDateLabel(dayOf(o));
                    return (
                      <div
                        key={o.id}
                        style={{
                          border: "1px solid #000",
                          borderRadius: 6,
                          padding: "8px 10px",
                          fontSize: 11,
                          lineHeight: 1.35,
                          background: isCancelled ? "#fee" : "#fff",
                          color: "#000",
                          breakInside: "avoid",
                          pageBreakInside: "avoid",
                        }}
                      >
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
                          <div style={{ color: "#444", fontSize: 11 }}>
                            {o.customerPhone}
                            {o.area ? ` · ${o.area}` : ""}
                          </div>
                          {o.address && (
                            <div style={{ color: "#555", fontSize: 10 }}>{o.address}</div>
                          )}
                          <div style={{ color: "#888", fontSize: 10, marginTop: 2, fontStyle: "italic" }}>
                            {lbl.full}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: 10,
                            color: "#222",
                            marginBottom: 4,
                          }}
                        >
                          {items}
                        </div>

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

                        {o.note && (
                          <div
                            style={{
                              color: "#b91c1c",
                              fontStyle: "italic",
                              fontSize: 10,
                              marginTop: 3,
                            }}
                          >
                            Note: {o.note}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Per-page totals — same dark style as the header for visual consistency */}
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
                    Page {chunkIdx + 1} totals · {chunkTotals[chunkIdx].count}{" "}
                    {chunkTotals[chunkIdx].count === 1 ? "order" : "orders"}
                    {chunkTotals[chunkIdx].cancelled > 0
                      ? ` (+${chunkTotals[chunkIdx].cancelled} cancelled)`
                      : ""}
                  </strong>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    Value {formatMoney(chunkTotals[chunkIdx].value)} · Paid{" "}
                    {formatMoney(chunkTotals[chunkIdx].collected)} ·{" "}
                    <strong>COD {formatMoney(chunkTotals[chunkIdx].cod)}</strong>
                  </span>
                </div>
              </section>
            );
          })
        )}

        {/* Grand totals — full width at the end of the manifest */}
        {inRange.length > 0 && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              border: "2px solid #000",
              borderRadius: 6,
              fontSize: 13,
              color: "#000",
              background: "#fafafa",
            }}
          >
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", marginBottom: 6 }}>
              Grand totals · {pageChunks.length} {pageChunks.length === 1 ? "page" : "pages"} · {inRange.length} orders
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>Active orders:</span>
              <strong>{grandTotals.orderCount}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>Delivered:</span>
              <strong>{grandTotals.deliveredCount}</strong>
            </div>
            {grandTotals.cancelledCount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Cancelled:</span>
                <strong>{grandTotals.cancelledCount}</strong>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>Total value:</span>
              <strong>{formatMoney(grandTotals.totalValue)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>Already collected:</span>
              <strong>{formatMoney(grandTotals.totalCollected)}</strong>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingTop: 6,
                borderTop: "1px solid #888",
                fontSize: 15,
              }}
            >
              <span style={{ fontWeight: 700 }}>Cash to collect (COD):</span>
              <strong style={{ fontWeight: 800 }}>{formatMoney(grandTotals.totalCOD)}</strong>
            </div>
          </div>
        )}

        {/* Signature */}
        <div
          style={{
            marginTop: 32,
            display: "flex",
            justifyContent: "space-between",
            gap: 40,
            fontSize: 12,
            color: "#000",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: 4, marginTop: 40 }}>Rider signature</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: 4, marginTop: 40 }}>Dispatch signature</div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: "#666" }}>
          Generated {new Date().toLocaleString("en-GB")} · Bazarey Meat Delivery Ops
        </div>
      </div>
    </div>
  );
}

export default function ManifestPageWrapper() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading manifest...</div>
      }
    >
      <ManifestContent />
    </Suspense>
  );
}