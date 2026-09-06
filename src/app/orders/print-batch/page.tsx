"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Order, Rider, Settings } from "@/lib/types";
import { formatMoney, bdParts } from "@/lib/ui";

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
  const extraIdsParam = searchParams.get("extraIds") || "";
  // autoprint=0 disables the on-load window.print() so the user can preview
  // and click the in-page "Save as PDF" button themselves. Default = auto print.
  const autoPrint = searchParams.get("autoprint") !== "0";
  // view=list — dense single-page table optimized for "save as PDF" download.
  // Default ("cards") — original 8-per-A4-page layout for physical printing.
  const listView = searchParams.get("view") === "list";
  // today=YYYY-MM-DD — when set, the main orders are delivered-today and any
  // extraIds are fetched only for status-count aggregation (confirmed /
  // cancelled / returned counts for the day).
  const todayDateStr = searchParams.get("today") || "";
  const ids = useMemo(
    () =>
      idsParam
        .split(",")
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n) && n > 0),
    [idsParam]
  );
  const extraIds = useMemo(
    () =>
      extraIdsParam
        .split(",")
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n) && n > 0),
    [extraIdsParam]
  );
  const allIds = useMemo(() => [...ids, ...extraIds], [ids, extraIds]);

  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (allIds.length === 0) return;
    (async () => {
      try {
        const fetched = await Promise.all([
          ...allIds.map((id) => fetch(`/api/orders/${id}`).then((r) => r.json())),
          fetch("/api/riders").then((r) => r.json()),
          fetch("/api/settings").then((r) => r.json()),
        ]);
        const fetchedOrders = fetched.slice(0, allIds.length).filter((o) => o && o.id);
        setOrders(fetchedOrders);
        setRiders(fetched[allIds.length] as Rider[]);
        setSettings(fetched[allIds.length + 1] as Settings);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [idsParam, extraIdsParam]);

  // Auto-print once loaded — only when not in download/preview mode.
  useEffect(() => {
    if (!autoPrint) return;
    if (!loading && orders.length > 0) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [loading, orders.length, autoPrint]);

  // Set document.title to a date-based filename so Chrome/Edge use it as
  // the suggested filename when the user picks "Save as PDF" in the print
  // dialog AND so the browser tab never flashes the raw URL during
  // hydration. Only applies in list view (the Download Today / single-page
  // report) so card-view batch prints keep their original naming.
  useEffect(() => {
    if (!listView) return;
    // Compute the BD date inline so we don't depend on a later-scope var.
    const now = new Date();
    const bdTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const fallbackDate = bdTime.toISOString().slice(0, 10);
    const dateForName = todayDateStr || fallbackDate;
    const safeBiz = (settings?.businessName || "Bazarey")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    document.title = `${safeBiz}-Daily-Orders-${dateForName}.pdf`;
    return () => {
      document.title = "Batch Print";
    };
  }, [listView, todayDateStr, settings?.businessName]);

  // Synchronous override — fires during the first render after settings
  // arrives so the tab title flips BEFORE useEffect can run. Prevents the
  // raw `/orders/print-batch?ids=…` URL from showing in the browser tab
  // even for a frame on slow connections.
  if (
    listView &&
    typeof document !== "undefined" &&
    (document.title.startsWith("localhost") ||
      document.title.includes("/orders/print-batch"))
  ) {
    const now = new Date();
    const bdTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const fallbackDate = bdTime.toISOString().slice(0, 10);
    const dateForName = todayDateStr || fallbackDate;
    const safeBiz = (settings?.businessName || "Bazarey")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    document.title = `${safeBiz}-Daily-Orders-${dateForName}.pdf`;
  }

  /** Page chunks of 8 orders each — 8 per printed A4 page (2 cols x 4 rows).
   *  Only used in card view; list view renders everything in one continuous table. */
  const pageChunks = useMemo(() => {
    if (listView) return [orders]; // single "chunk" = entire list, no forced break
    const chunks: Order[][] = [];
    for (let i = 0; i < orders.length; i += 8) chunks.push(orders.slice(i, i + 8));
    return chunks;
  }, [orders, listView]);

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

  const totalAll = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + o.total, 0);
  const paidAll = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + o.paid, 0);
  const dueAll = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + Math.max(0, o.total - o.paid), 0);
  // Bangladesh timezone (UTC+6) — server runs in UTC, so we shift manually
  const now = new Date();
  const bdTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const printedDateStr = bdTime.toISOString().slice(0, 10);
  const printedTimeStr = bdTime.toISOString().slice(11, 16);

  return (
    <div>
      <style>{`
        ${listView ? `
          @page { size: A4; margin: 8mm; }
          /* Force light theme for on-screen preview regardless of host dark mode. */
          html, body { background: #fff !important; color: #1f2937 !important; margin: 0; }
          .list-wrap { background: #fff; color: #1f2937; padding: 0; font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Noto Sans Bengali"; }

          /* ===== Brand palette (vibrant, color-coded by status) ===== */
          --header-from: #064e3b;            /* deep emerald */
          --header-to:   #16a34a;            /* bright leaf-green */
          --accent: #16a34a;
          --accent-2: #22c55e;
          --text: #111827;
          --muted: #6b7280;
          --border: #e5e7eb;

          --c-new:    #2563eb;  /* blue */
          --c-new-bg: #eff6ff;
          --c-conf:   #7c3aed;  /* violet */
          --c-conf-bg:#f5f3ff;
          --c-prep:   #d97706;  /* amber */
          --c-prep-bg:#fffbeb;
          --c-out:    #0891b2;  /* cyan */
          --c-out-bg: #ecfeff;
          --c-deliv:  #15803d;  /* green */
          --c-deliv-bg:#dcfce7;
          --c-canc:   #b91c1c;  /* red */
          --c-canc-bg:#fee2e2;
          --c-ret:    #b45309;  /* dark amber */
          --c-ret-bg: #fef3c7;

          /* ===== Header band (vibrant gradient) ===== */
          .doc-header {
            background: linear-gradient(135deg, var(--header-from) 0%, #065f46 35%, var(--header-to) 100%);
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: #fff;
            box-shadow: 0 4px 12px rgba(6, 78, 59, 0.18);
            position: relative;
            overflow: hidden;
          }
          .doc-header::after {
            content: "";
            position: absolute;
            right: -40px; top: -40px;
            width: 160px; height: 160px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%);
            pointer-events: none;
          }
          .header-left { display: flex; align-items: center; gap: 14px; position: relative; z-index: 1; }
          .brand-icon {
            width: 48px; height: 48px;
            border-radius: 10px;
            background: rgba(255,255,255,0.14);
            border: 2px solid rgba(255,255,255,0.32);
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px);
          }
          .brand-icon-svg { width: 26px; height: 26px; }
          .header-title { line-height: 1.15; }
          .header-title h1 { margin: 0; font-size: 24px; font-weight: 800; color: #fff; letter-spacing: -0.4px; }
          .header-title .bn { font-size: 12px; color: rgba(255,255,255,0.82); margin-top: 3px; font-weight: 600; }
          .header-right { text-align: right; color: #fff; line-height: 1.2; position: relative; z-index: 1; }
          .header-right .date { font-size: 15px; font-weight: 700; }
          .header-right .doc-id { font-size: 10px; color: rgba(255,255,255,0.78); margin-top: 4px; font-weight: 600; letter-spacing: 0.3px; }
          .header-right .doc-id .dot { color: rgba(255,255,255,0.5); margin: 0 6px; }

          /* ===== Section title with green left bar + bilingual subtitle ===== */
          .section-title {
            display: flex; align-items: baseline; gap: 10px;
            margin: 14px 0 8px; padding-left: 12px;
            border-left: 4px solid var(--accent);
          }
          .section-title .en { font-size: 14px; font-weight: 800; color: var(--text); letter-spacing: -0.2px; }
          .section-title .bn { font-size: 11px; color: var(--muted); font-weight: 600; }

          /* ===== KPI grid — gradient cards with top accent bar ===== */
          .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 12px; }
          .kpi {
            position: relative;
            border: 1px solid var(--border);
            border-top: 4px solid var(--kpi-color, #374151);
            border-radius: 6px;
            background: linear-gradient(180deg, #fff 0%, var(--kpi-bg, #fff) 100%);
            padding: 10px 12px;
            overflow: hidden;
          }
          .kpi::after {
            content: "";
            position: absolute;
            right: -12px; bottom: -12px;
            width: 56px; height: 56px;
            border-radius: 50%;
            background: var(--kpi-color, #374151);
            opacity: 0.06;
            pointer-events: none;
          }
          .kpi.black  { --kpi-color: #111827; --kpi-bg: #f9fafb; }
          .kpi.green  { --kpi-color: #15803d; --kpi-bg: #f0fdf4; }
          .kpi.red    { --kpi-color: #b91c1c; --kpi-bg: #fef2f2; }
          .kpi.amber  { --kpi-color: #b45309; --kpi-bg: #fffbeb; }
          .kpi.blue   { --kpi-color: #1d4ed8; --kpi-bg: #eff6ff; }
          .kpi .label { font-size: 9.5px; font-weight: 700; color: var(--kpi-color, var(--muted)); letter-spacing: 0.5px; text-transform: uppercase; }
          .kpi .bn { font-size: 9.5px; color: var(--muted); margin-top: 1px; font-weight: 600; }
          .kpi .value {
            font-size: 22px; font-weight: 800; color: var(--kpi-color, var(--text));
            margin-top: 6px; font-variant-numeric: tabular-nums; letter-spacing: -0.5px;
            position: relative; z-index: 1;
          }

          /* ===== Status distribution bar (stacked horizontal) ===== */
          .status-bar {
            display: flex;
            height: 10px;
            border-radius: 999px;
            overflow: hidden;
            margin: 6px 0 12px;
            background: #f3f4f6;
            border: 1px solid var(--border);
          }
          .status-bar .seg { transition: width 0.2s; }
          .status-bar .seg.deliv  { background: linear-gradient(90deg, #15803d, #22c55e); }
          .status-bar .seg.canc   { background: linear-gradient(90deg, #b91c1c, #ef4444); }
          .status-bar .seg.ret    { background: linear-gradient(90deg, #b45309, #f59e0b); }
          .status-bar .seg.prep   { background: linear-gradient(90deg, #d97706, #fbbf24); }
          .status-bar .seg.conf   { background: linear-gradient(90deg, #7c3aed, #a78bfa); }
          .status-bar .seg.out    { background: linear-gradient(90deg, #0891b2, #22d3ee); }
          .status-bar .seg.new    { background: linear-gradient(90deg, #2563eb, #60a5fa); }

          .legend {
            display: flex; flex-wrap: wrap; gap: 6px 12px;
            margin-bottom: 10px; font-size: 10px;
          }
          .legend-item { display: inline-flex; align-items: center; gap: 5px; color: var(--text); font-weight: 600; }
          .legend-dot { width: 8px; height: 8px; border-radius: 999px; flex: none; }
          .legend-dot.deliv { background: #22c55e; }
          .legend-dot.canc  { background: #ef4444; }
          .legend-dot.ret   { background: #f59e0b; }
          .legend-dot.prep  { background: #fbbf24; }
          .legend-dot.conf  { background: #a78bfa; }
          .legend-dot.out   { background: #22d3ee; }
          .legend-dot.new   { background: #60a5fa; }

          /* ===== Orders table — colored status-coded rows ===== */
          .orders-table {
            width: 100%; border-collapse: collapse;
            font-size: 10.5px; color: var(--text);
            background: #fff;
            border: 1px solid var(--border);
            border-radius: 6px; overflow: hidden;
          }
          .orders-table thead th {
            background: linear-gradient(180deg, #064e3b 0%, #065f46 100%);
            color: #fff;
            padding: 9px 10px;
            text-align: left;
            font-weight: 700;
            font-size: 10.5px;
            letter-spacing: 0.2px;
            border-right: 1px solid rgba(255,255,255,0.14);
          }
          .orders-table thead th:last-child { border-right: 0; }
          .orders-table thead .bn { display: block; font-size: 8.5px; color: rgba(255,255,255,0.72); font-weight: 500; margin-top: 1px; }
          .orders-table tbody td {
            padding: 7px 10px;
            border-top: 1px solid var(--border);
            border-right: 1px solid var(--border);
            vertical-align: middle;
            font-weight: 600;
          }
          .orders-table tbody td:last-child { border-right: 0; }
          /* Color-coded left accent on each row by status */
          .orders-table tbody tr { position: relative; }
          .orders-table tbody td:first-child { border-left: 3px solid var(--row-accent, transparent); }
          .orders-table tbody tr.row-new    { --row-accent: var(--c-new); background: var(--c-new-bg); }
          .orders-table tbody tr.row-conf   { --row-accent: var(--c-conf); background: var(--c-conf-bg); }
          .orders-table tbody tr.row-prep   { --row-accent: var(--c-prep); background: var(--c-prep-bg); }
          .orders-table tbody tr.row-out    { --row-accent: var(--c-out); background: var(--c-out-bg); }
          .orders-table tbody tr.row-delivered { --row-accent: var(--c-deliv); background: var(--c-deliv-bg); }
          .orders-table tbody tr.row-cancelled { --row-accent: var(--c-canc); background: var(--c-canc-bg); }
          .orders-table tbody tr.row-returned  { --row-accent: var(--c-ret); background: var(--c-ret-bg); }
          .orders-table tbody tr { page-break-inside: avoid; break-inside: avoid; }
          .orders-table .order-no { color: #15803d; font-weight: 800; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; }
          .orders-table .sl { color: var(--muted); font-weight: 700; font-variant-numeric: tabular-nums; }
          .orders-table .amount { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; color: var(--text); }
          .orders-table .taka { color: #15803d; font-weight: 700; margin-right: 2px; }
          .orders-table .phone { color: var(--muted); font-size: 9.5px; font-weight: 500; margin-top: 1px; }

          /* ===== Status pills (vibrant with subtle gradient) ===== */
          .pill {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 999px;
            font-size: 9.5px;
            font-weight: 800;
            letter-spacing: 0.2px;
            border: 1px solid currentColor;
          }
          .pill.new        { background: linear-gradient(180deg, #dbeafe, #bfdbfe); color: #1d4ed8; border-color: #93c5fd; }
          .pill.confirmed  { background: linear-gradient(180deg, #ede9fe, #ddd6fe); color: #6d28d9; border-color: #c4b5fd; }
          .pill.preparing  { background: linear-gradient(180deg, #fef3c7, #fde68a); color: #b45309; border-color: #fcd34d; }
          .pill["out-for-delivery"] { background: linear-gradient(180deg, #cffafe, #a5f3fc); color: #0e7490; border-color: #67e8f9; }
          .pill.delivered  { background: linear-gradient(180deg, #dcfce7, #bbf7d0); color: #15803d; border-color: #86efac; }
          .pill.cancelled  { background: linear-gradient(180deg, #fee2e2, #fecaca); color: #b91c1c; border-color: #fca5a5; }
          .pill.returned   { background: linear-gradient(180deg, #fef3c7, #fde68a); color: #b45309; border-color: #fcd34d; }

          /* ===== Footer (subtle gradient line + brand text) ===== */
          .doc-footer {
            display: flex; justify-content: space-between; align-items: center;
            margin-top: 12px; padding-top: 10px;
            font-size: 10px; color: var(--muted); font-weight: 500;
            border-top: 2px solid transparent;
            border-image: linear-gradient(90deg, var(--accent), transparent) 1;
          }

          @media print {
            /* Force the browser to print background colors / gradients
               (Chrome / Edge otherwise strip them by default, killing the
               colorful report). */
            *, *::before, *::after {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            .no-print { display: none !important; }
            body { background: #fff !important; }
            .doc-header { border-radius: 0; box-shadow: none; }
            .kpi .value { font-size: 18px; }
          }
        ` : `
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
        `}
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
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <strong>Batch Print · {orders.length} orders</strong>
          {!autoPrint && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Tip: click <b>Save as PDF</b> below, set destination to <i>Save as PDF</i>, keep{" "}
              <b>Background graphics ON</b> for color, and the file will be named{" "}
              <code style={codeStyle}>{document.title}</code>.
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => window.print()}>
            {autoPrint ? "Print" : "Save as PDF"}
          </button>
          <button className="btn btn-secondary" onClick={() => window.close()}>
            Close
          </button>
        </div>
      </div>

      <div className={listView ? "list-wrap" : undefined} style={{ padding: 12 }}>
        <h1 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 4px" }}>
          {settings?.businessName || "Bazarey Ltd"} —{" "}
          {listView ? "Daily Orders Summary" : "Batch Delivery Sheet"}
        </h1>
        <p style={{ margin: "0 0 10px", fontSize: 11, color: "#444" }}>
          {listView
            ? `Scheduled for ${printedDateStr} · ${orders.length} orders (all statuses)`
            : `Printed ${printedDateStr} ${printedTimeStr} · ${orders.length} orders · ${
                pageChunks.length
              } ${pageChunks.length === 1 ? "page" : "pages"}`}
        </p>

        {listView ? (
          // Compact one-page table view — used for "Download Today" / "Download PDF".
          // No page breaks, dense rows, prints everything on a single A4.
          <ListViewTable
            orders={orders}
            mainIds={ids}
            riders={riders}
            settings={settings}
            printedDateStr={printedDateStr}
            todayDateStr={todayDateStr}
          />
        ) : (
          pageChunks.map((chunk, chunkIdx) => {
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
        }))}

        {/* Grand total — only on the very last page (card view only; list view has its own footer row) */}
        {!listView && (
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
        )}
      </div>
    </div>
  );
}

/** Professional single-page report — used for "Download Today" / "Download PDF".
 *  Branded header, summary KPI cards, today's status row, dense orders
 *  table, payment/cluster breakdown, signature footer. Designed to fit
 *  on a single A4 sheet. */
function ListViewTable({
  orders,
  mainIds,
  riders,
  settings,
  printedDateStr,
  todayDateStr,
}: {
  orders: Order[];
  mainIds: number[];
  riders: Rider[];
  settings: Settings | null;
  printedDateStr: string;
  todayDateStr: string;
}) {
  // The main orders table = only the orders whose ids appear in mainIds
  // (i.e. orders delivered today). Other orders in `orders` were fetched
  // only so we can compute status-counts for today.
  const mainIdSet = useMemo(() => new Set(mainIds), [mainIds]);
  const tableOrders = useMemo(() => {
    // Active statuses render in their natural order (newest id first).
    // Cancelled + returned are pushed to the bottom of the report so the
    // day's live queue is easy to scan; within the "ended" group we still
    // keep the newest-id-first ordering.
    const ENDED: ReadonlySet<Order["status"]> = new Set(["cancelled", "returned"]);
    return orders
      .filter((o) => mainIdSet.has(o.id))
      .slice() // don't mutate the source
      .sort((a, b) => {
        const aEnded = ENDED.has(a.status) ? 1 : 0;
        const bEnded = ENDED.has(b.status) ? 1 : 0;
        if (aEnded !== bEnded) return aEnded - bEnded;
        return b.id - a.id;
      });
  }, [orders, mainIdSet]);

  const riderName = (o: Order) =>
    o.deliveryMode === "pathao"
      ? "Pathao"
      : o.riderId
      ? riders.find((r) => r.id === o.riderId)?.name ?? `#${o.riderId}`
      : "—";

  // Cash Collected = total of every order EXCEPT cancelled. Cancelled orders
  // never produced revenue, so their totals must be deducted from the
  // daily cash figure even though they still appear in the orders table.
  const totalAll = tableOrders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + o.total, 0);
  const cancelledTotal = tableOrders
    .filter((o) => o.status === "cancelled")
    .reduce((s, o) => s + o.total, 0);

  // Status counts for today — each status counted by its OWN timestamp's BD date.
  // Delivered & confirmed: count even if scheduled for a previous day (catches
  // late deliveries and confirmations done today for back-dated orders).
  // Cancelled & returned: only count if also scheduled for today, so bulk
  // cleanup of stale old orders doesn't inflate the count.
  const statusCounts = useMemo(() => {
    const day = todayDateStr;
    const isToday = (iso: string) => !!iso && bdParts(iso).date === day;
    const c = { confirmed: 0, delivered: 0, cancelled: 0, returned: 0, out: 0 };
    for (const o of orders) {
      if (isToday(o.confirmedAt)) c.confirmed += 1;
      if (isToday(o.deliveredAt)) c.delivered += 1;
      if (isToday(o.cancelledAt) && o.date === day) c.cancelled += 1;
      if (isToday(o.returnedAt) && o.date === day) c.returned += 1;
      if (isToday(o.deliveredAt) && o.deliveryMode === "pathao") c.out += 1;
    }
    return c;
  }, [orders, todayDateStr]);

  const docId = `RPT-${printedDateStr.replace(/-/g, "")}-${tableOrders.length}`;
  const businessName = settings?.businessName || "Bazarey Ltd";

  return (
    <div>
      {/* ===== Header (matches reference: dark teal band) ===== */}
      <div className="doc-header">
        <div className="header-left">
          <div className="brand-icon" aria-hidden>
            <svg className="brand-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9z" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M3 7.5L12 12l9-4.5M12 12v9" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M7.5 5.25L16.5 9.75" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div className="header-title">
            <h1>{businessName}</h1>
            <div className="bn">দৈনিক অর্ডার সারাংশ · Daily Orders Summary · All Statuses</div>
          </div>
        </div>
        <div className="header-right">
          <div className="date">{prettyDate(printedDateStr)}</div>
          <div className="doc-id">
            চালান কোড <span className="dot">•</span> #{docId}
          </div>
        </div>
      </div>

      {/* ===== Section: Order Summary ===== */}
      <div className="section-title">
        <span className="en">Order Summary</span>
        <span className="bn">অর্ডার সারাংশ</span>
      </div>

      <div className="kpi-grid">
        <div className="kpi black">
          <div className="label">Total Orders</div>
          <div className="bn">মোট অর্ডার</div>
          <div className="value">{tableOrders.length}</div>
        </div>
        <div className="kpi green">
          <div className="label">Delivered</div>
          <div className="bn">ডেলিভার্ড</div>
          <div className="value">{statusCounts.delivered}</div>
        </div>
        <div className="kpi red">
          <div className="label">Cancelled</div>
          <div className="bn">বাতিল</div>
          <div className="value">{statusCounts.cancelled}</div>
        </div>
        <div className="kpi amber">
          <div className="label">Returned</div>
          <div className="bn">ফিরিয়ে</div>
          <div className="value">{statusCounts.returned}</div>
        </div>
        <div className="kpi blue">
          <div className="label">Cash Collected</div>
          <div className="bn">মোট সংগৃহীত</div>
          <div className="value" style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 2 }}>
            <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 700 }}>৳</span>
            <span>{totalAll.toLocaleString("en-IN")}</span>
          </div>
          {cancelledTotal > 0 && (
            <div
              style={{
                fontSize: 9,
                marginTop: 2,
                color: "var(--accent-red)",
                fontWeight: 600,
              }}
            >
              −৳{cancelledTotal.toLocaleString("en-IN")} cancelled
            </div>
          )}
        </div>
      </div>

      {/* ===== Status distribution bar + legend ===== */}
      {(() => {
        const counts = {
          delivered: tableOrders.filter((o) => o.status === "delivered").length,
          cancelled: tableOrders.filter((o) => o.status === "cancelled").length,
          returned: tableOrders.filter((o) => o.status === "returned").length,
          preparing: tableOrders.filter((o) => o.status === "preparing").length,
          confirmed: tableOrders.filter((o) => o.status === "confirmed").length,
          out: tableOrders.filter((o) => o.status === "out-for-delivery").length,
          newOrder: tableOrders.filter((o) => o.status === "new").length,
        };
        const total = Math.max(1, tableOrders.length);
        const pct = (n: number) => (n / total) * 100;
        return (
          <>
            <div className="status-bar" aria-hidden>
              {counts.delivered > 0 && <div className="seg deliv" style={{ width: `${pct(counts.delivered)}%` }} />}
              {counts.out > 0 && <div className="seg out" style={{ width: `${pct(counts.out)}%` }} />}
              {counts.preparing > 0 && <div className="seg prep" style={{ width: `${pct(counts.preparing)}%` }} />}
              {counts.confirmed > 0 && <div className="seg conf" style={{ width: `${pct(counts.confirmed)}%` }} />}
              {counts.newOrder > 0 && <div className="seg new" style={{ width: `${pct(counts.newOrder)}%` }} />}
              {counts.returned > 0 && <div className="seg ret" style={{ width: `${pct(counts.returned)}%` }} />}
              {counts.cancelled > 0 && <div className="seg canc" style={{ width: `${pct(counts.cancelled)}%` }} />}
            </div>
            <div className="legend">
              <span className="legend-item"><span className="legend-dot deliv" />Delivered ({counts.delivered})</span>
              <span className="legend-item"><span className="legend-dot out" />In Transit ({counts.out})</span>
              <span className="legend-item"><span className="legend-dot prep" />Preparing ({counts.preparing})</span>
              <span className="legend-item"><span className="legend-dot conf" />Confirmed ({counts.confirmed})</span>
              <span className="legend-item"><span className="legend-dot new" />New ({counts.newOrder})</span>
              <span className="legend-item"><span className="legend-dot ret" />Returned ({counts.returned})</span>
              <span className="legend-item"><span className="legend-dot canc" />Cancelled ({counts.cancelled})</span>
            </div>
          </>
        );
      })()}

      {/* ===== Section: Order Details ===== */}
      <div className="section-title">
        <span className="en">Order Details</span>
        <span className="bn">অর্ডার বিস্তারিত তালিকা</span>
      </div>

      <table className="orders-table">
        <thead>
          <tr>
            <th style={{ width: 36 }}>
              #<span className="bn">ক্রম</span>
            </th>
            <th style={{ width: 110 }}>
              Order ID<span className="bn">অর্ডার আইডি</span>
            </th>
            <th>
              Customer<span className="bn">ক্রেতার নাম</span>
            </th>
            <th style={{ width: 100 }}>
              Area<span className="bn">এলাকা</span>
            </th>
            <th style={{ width: 110 }}>
              Rider<span className="bn">রাইডার</span>
            </th>
            <th style={{ width: 110, textAlign: "right" }}>
              Amount<span className="bn">পরিমাণ (৳)</span>
            </th>
            <th style={{ width: 110 }}>
              Status<span className="bn">অবস্থান</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tableOrders.map((o, i) => (
            <tr key={o.id} className={`row-${ROW_CLASS[o.status] || "other"}`}>
              <td className="sl">{toBanglaNum(i + 1)}</td>
              <td className="order-no">{o.orderNo}</td>
              <td>
                <div style={{ fontWeight: 700 }}>{o.customerName}</div>
                {o.customerPhone && (
                  <div className="phone">{o.customerPhone}</div>
                )}
              </td>
              <td>{o.area || "—"}</td>
              <td>{riderName(o)}</td>
              <td className="amount">
                <span className="taka">৳</span>
                {o.total.toLocaleString("en-IN")}
              </td>
              <td>
                <span className={`pill ${PILL_CLASS[o.status] || "other"}`}>
                  {STATUS_LABEL[o.status] || o.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ===== Footer ===== */}
      <div className="doc-footer">
        <div>
          Generated by {businessName} <span style={{ color: "var(--border)" }}>•</span> Daily Delivery Operations
        </div>
        <div>
          {prettyDate(printedDateStr)} <span style={{ color: "var(--border)" }}>•</span> One-Page Summary
        </div>
      </div>
    </div>
  );
}

/** Convert digits to Bangla numerals (e.g. 12 → ১২) for the serial column. */
function toBanglaNum(n: number): string {
  const map = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(n)
    .split("")
    .map((d) => (map[Number(d)] !== undefined ? map[Number(d)] : d))
    .join("");
}

const codeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: 10,
  padding: "1px 6px",
  borderRadius: 3,
  background: "rgba(22, 163, 74, 0.10)",
  color: "#15803d",
  border: "1px solid rgba(22, 163, 74, 0.25)",
};

/** Format YYYY-MM-DD → "05 September 2026". */
function prettyDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${String(d).padStart(2, "0")} ${months[m - 1]} ${y}`;
}

const PILL_CLASS: Record<string, string> = {
  delivered: "delivered",
  cancelled: "cancelled",
  returned: "returned",
  preparing: "preparing",
  confirmed: "confirmed",
  new: "new",
  "out-for-delivery": "out-for-delivery",
};

const ROW_CLASS: Record<string, string> = PILL_CLASS;

const STATUS_LABEL: Record<string, string> = {
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  "out-for-delivery": "In Transit",
  preparing: "Preparing",
  confirmed: "Confirmed",
  new: "New",
};