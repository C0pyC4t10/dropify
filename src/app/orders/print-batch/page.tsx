"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Order, Rider, Settings } from "@/lib/types";
import { formatMoney, bdParts, EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_COLORS } from "@/lib/ui";

/** Categories for manual intake of PDF / phone orders.
 *  `kind: "enter"` rows count as orders the operator intends to put into the
 *  system today. `kind: "skip"` rows are orders received but rejected (dup,
 *  unreachable, out-of-stock, etc.) and are shown for reconciliation. */
type IntakeCategory =
  | "inside_dhaka"
  | "outside_dhaka"
  | "duplicate"
  | "wrong_number"
  | "invalid_address"
  | "out_of_stock"
  | "cancelled"
  | "other";

interface IntakeCategoryDef {
  id: IntakeCategory;
  /** English label shown in dropdown and PDF. */
  label: string;
  /** Bangla label shown in PDF. */
  labelBn: string;
  /** Whether orders in this category will be entered into the system. */
  kind: "enter" | "skip";
}

const INTAKE_CATEGORIES: IntakeCategoryDef[] = [
  { id: "inside_dhaka",    label: "Inside Dhaka",            labelBn: "ঢাকার ভিতরে",       kind: "enter" },
  { id: "outside_dhaka",   label: "Outside Dhaka",           labelBn: "ঢাকার বাইরে",       kind: "enter" },
  { id: "duplicate",       label: "Duplicate order",         labelBn: "ডুপ্লিকেট অর্ডার",   kind: "skip"  },
  { id: "wrong_number",    label: "Wrong number",            labelBn: "ভুল নম্বর",          kind: "skip"  },
  { id: "invalid_address", label: "Invalid address",         labelBn: "ঠিকানা অনুপস্থিত",   kind: "skip"  },
  { id: "out_of_stock",    label: "Out of stock",            labelBn: "স্টক নেই",           kind: "skip"  },
  { id: "cancelled",       label: "Customer cancelled",      labelBn: "ক্রেতা বাতিল",       kind: "skip"  },
  { id: "other",           label: "Other",                   labelBn: "অন্যান্য",           kind: "skip"  },
];

const INTAKE_CATEGORY_LABEL: Record<IntakeCategory, string> = Object.fromEntries(
  INTAKE_CATEGORIES.map((c) => [c.id, c.label])
) as Record<IntakeCategory, string>;
const INTAKE_CATEGORY_LABEL_BN: Record<IntakeCategory, string> = Object.fromEntries(
  INTAKE_CATEGORIES.map((c) => [c.id, c.labelBn])
) as Record<IntakeCategory, string>;
const INTAKE_CATEGORY_KIND: Record<IntakeCategory, "enter" | "skip"> = Object.fromEntries(
  INTAKE_CATEGORIES.map((c) => [c.id, c.kind])
) as Record<IntakeCategory, "enter" | "skip">;

/** One row in the manual intake breakdown. */
interface IntakeRow {
  /** Local unique id used as React key + stable identity in the saved payload. */
  uid: string;
  category: IntakeCategory;
  /** Count typed by the operator — kept as string so empty input is allowed. */
  count: string;
  /** Optional free-text note for "Other" rows. */
  note?: string;
  /** Order numbers from the PDF / phone list — comma- or space-separated.
   *  Lets the operator cross-check which specific orders fall in each bucket. */
  orderNumbers?: string;
}

/** Read the per-day manual-intake localStorage entry.
 *  Returns the new structured `rows` shape if present, otherwise `[]`. Old
 *  flat-schema entries (`{ pdfTotal, outsideDhaka }`) are ignored — operators
 *  re-enter under the new structured model on first use. SSR-safe. */
function readIntake(key: string): { rows: IntakeRow[]; pdfTotal: string } {
  if (typeof window === "undefined") return { rows: [], pdfTotal: "" };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { rows: [], pdfTotal: "" };
    const parsed = JSON.parse(raw);
    const pdfTotal =
      typeof parsed?.pdfTotal === "string"
        ? parsed.pdfTotal
        : parsed?.pdfTotal != null && Number.isFinite(Number(parsed.pdfTotal))
        ? String(Number(parsed.pdfTotal))
        : "";
    if (!Array.isArray(parsed?.rows)) return { rows: [], pdfTotal };
    const rows = parsed.rows
      .filter(
        (r: unknown): r is { category: string; count: unknown; note?: unknown; uid?: unknown; orderNumbers?: unknown } =>
          typeof r === "object" && r !== null &&
          typeof (r as { category?: unknown }).category === "string" &&
          (r as { category: string }).category in INTAKE_CATEGORY_LABEL
      )
      .map((r: { uid?: unknown; category: string; count: unknown; note?: unknown; orderNumbers?: unknown }) => ({
        uid: typeof r.uid === "string" ? r.uid : crypto.randomUUID(),
        category: r.category as IntakeCategory,
        count: typeof r.count === "string" ? r.count : String(Number(r.count) || ""),
        note: typeof r.note === "string" ? r.note : "",
        orderNumbers: typeof r.orderNumbers === "string" ? r.orderNumbers : "",
      }));
    return { rows, pdfTotal };
  } catch {
    return { rows: [], pdfTotal: "" };
  }
}

/** Safe numeric helper for an intake row count. Empty / NaN → 0. */
function rowCount(r: Pick<IntakeRow, "count">): number {
  const n = Number(r.count);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** One named, persistent copy of the intake breakdown. Stored in
 *  localStorage under `daily-summary-snapshots` so the operator can reopen
 *  yesterday's or last week's report and re-download the PDF. */
interface IntakeSnapshot {
  id: string;
  /** Operator-supplied name (or auto-generated). */
  name: string;
  /** ISO timestamp when the snapshot was created. */
  savedAt: string;
  /** The report date the snapshot belongs to (todayDateStr). */
  date: string;
  rows: IntakeRow[];
  /** Raw "Total Order From PDF" at snapshot time. Optional so older
   *  snapshots (saved before this field existed) still load. */
  pdfTotal?: string;
}

const SNAPSHOTS_STORAGE_KEY = "daily-summary-snapshots";

function readSnapshots(): IntakeSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SNAPSHOTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Coerce — older / malformed entries are dropped rather than thrown out.
    return parsed
      .filter(
        (s: unknown): s is { id: string; name: unknown; savedAt: unknown; date: unknown; rows: unknown; pdfTotal?: unknown } =>
          typeof s === "object" && s !== null &&
          typeof (s as { id?: unknown }).id === "string"
      )
      .map((s) => ({
        id: s.id,
        name: typeof s.name === "string" ? s.name : "Untitled",
        savedAt: typeof s.savedAt === "string" ? s.savedAt : new Date().toISOString(),
        date: typeof s.date === "string" ? s.date : "",
        rows: Array.isArray(s.rows)
          ? (s.rows.filter((r): r is IntakeRow => typeof r === "object" && r !== null && "uid" in (r as object)) as IntakeRow[])
          : [],
        pdfTotal: typeof s.pdfTotal === "string" ? s.pdfTotal : "",
      }));
  } catch {
    return [];
  }
}

function writeSnapshots(list: IntakeSnapshot[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded — silently skip; operator can prune old snapshots.
  }
}

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

  // Today's expense summary — fetched for the report date so the printed PDF
  // shows a per-category breakdown of what was spent on the day. Empty
  // summary on first paint; replaced once the fetch resolves.
  const [expenseSummary, setExpenseSummary] = useState<{
    total: number;
    count: number;
    byCategory: Array<{ category: string; total: number; count: number }>;
  } | null>(null);

  // Manual intake — operator's breakdown of orders received today via
  // phone / WhatsApp / PDF list. Each row = one category + count, so the
  // operator can record both the good orders (Inside Dhaka / Outside Dhaka)
  // and the rejected ones (duplicate, wrong number, out of stock, etc.) in
  // one place. Persisted per-day in localStorage so a refresh or re-print
  // keeps the same breakdown.
  // Stable per-day key — the report date (today or the printed date fallback).
  // Computed in render so it's always in sync with the report header.
  const summaryKey = `daily-summary:${todayDateStr || ""}`;

  // Lazy initializer — reads once at mount so we don't setState in an effect.
  const initialIntake = readIntake(summaryKey);
  const [intakeRows, setIntakeRows] = useState<IntakeRow[]>(initialIntake.rows);
  /** Raw "Total Order From PDF" — the total count of orders received today
   *  from the PDF list. Stored independently from the per-category breakdown
   *  so the operator can record the demand volume even if they haven't
   *  categorized everything yet. */
  const [pdfTotal, setPdfTotal] = useState<string>(initialIntake.pdfTotal);

  // Saved snapshots — named, persistent copies of the intake breakdown.
  // Independent of the per-day auto-save above; snapshots survive day roll-
  // over and can be reopened to re-download the PDF.
  const [snapshots, setSnapshots] = useState<IntakeSnapshot[]>(() => readSnapshots());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        summaryKey,
        JSON.stringify({ rows: intakeRows, pdfTotal })
      );
    } catch {
      // Storage full / disabled — silently skip.
    }
  }, [summaryKey, intakeRows, pdfTotal]);

  const saveSnapshot = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const snap: IntakeSnapshot = {
      id: crypto.randomUUID(),
      name: trimmed,
      savedAt: new Date().toISOString(),
      date: todayDateStr || "",
      rows: intakeRows,
      pdfTotal,
    };
    const next = [snap, ...snapshots].slice(0, 50); // cap to keep storage sane
    setSnapshots(next);
    writeSnapshots(next);
  };
  const loadSnapshot = (snap: IntakeSnapshot) => {
    setIntakeRows(
      snap.rows.length > 0
        ? snap.rows.map((r) => ({ ...r, uid: crypto.randomUUID() }))
        : []
    );
    setPdfTotal(snap.pdfTotal ?? "");
  };
  const deleteSnapshot = (id: string) => {
    const next = snapshots.filter((s) => s.id !== id);
    setSnapshots(next);
    writeSnapshots(next);
  };

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

    // Expense summary for the report date — only meaningful in list view
    // (the daily summary PDF). Other modes don't show expenses so skip the
    // round-trip to save a request.
    if (listView) {
      // BD-local date for "today" if the URL didn't pin one.
      const now = new Date();
      const bdKey = new Date(now.getTime() + 6 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const dateKey = todayDateStr || bdKey;
      const url = `/api/expenses/summary?from=${encodeURIComponent(dateKey)}&to=${encodeURIComponent(dateKey)}`;
      fetch(url, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && typeof data === "object") {
            setExpenseSummary({
              total: Number(data.total) || 0,
              count: Number(data.count) || 0,
              byCategory: Array.isArray(data.byCategory)
                ? data.byCategory
                    .filter(
                      (c: unknown): c is { category: string; total: number; count: number } =>
                        typeof c === "object" &&
                        c !== null &&
                        typeof (c as { category?: unknown }).category === "string"
                    )
                    .map((c: { category: string; total: number; count: number }) => ({
                      category: c.category,
                      total: Number(c.total) || 0,
                      count: Number(c.count) || 0,
                    }))
                : [],
            });
          }
        })
        .catch(() => {
          // Expense endpoint failure is non-fatal — leave summary null and
          // skip the section in the PDF.
        });
    }
  }, [idsParam, extraIdsParam, listView, todayDateStr]);

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
    const safeBiz = (settings?.businessName || "")
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
    const safeBiz = (settings?.businessName || "")
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

  // Grand-total row on the card view: "Value" is the sum of paid amounts
  // for orders with cash in hand right now (delivered; cancelled and
  // returned are excluded — see ListViewTable cashCollected logic above).
  const totalAll = orders
    .filter((o) => o.status !== "cancelled" && o.status !== "returned")
    .reduce((s, o) => s + o.paid, 0);
  const paidAll = orders
    .filter((o) => o.status !== "cancelled" && o.status !== "returned")
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

          /* ===== Header band removed — content starts directly with the
             Order Summary section. The page-level <h1> above carries the
             business name + report title and date. */

          /* ===== Section title with green left bar + bilingual subtitle ===== */
          .section-title {
            display: flex; align-items: baseline; gap: 10px;
            margin: 4px 0 8px; padding-left: 12px;
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
            padding: 6px 12px;
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
          .kpi .label { font-size: 9.5px; font-weight: 700; color: var(--kpi-color, var(--muted)); letter-spacing: 0.5px; text-transform: uppercase; line-height: 1.2; }
          .kpi .bn { font-size: 9.5px; color: var(--muted); margin-top: 0; font-weight: 600; line-height: 1.2; }
          .kpi .value {
            font-size: 19px; font-weight: 800; color: var(--kpi-color, var(--text));
            margin-top: 2px; font-variant-numeric: tabular-nums; letter-spacing: -0.5px;
            position: relative; z-index: 1;
            line-height: 1.1;
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

          /* ===== Manual Intake (operator-entered PDF / phone counts) ===== */
          .intake-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10.5px;
            color: var(--text);
            background: #fff;
            border: 1px solid var(--border);
            border-radius: 6px;
            overflow: hidden;
            margin: 4px 0 10px;
          }
          .intake-table thead th {
            background: linear-gradient(180deg, #064e3b 0%, #065f46 100%);
            color: #fff;
            padding: 7px 10px;
            font-weight: 700;
            font-size: 10px;
            letter-spacing: 0.2px;
            border-right: 1px solid rgba(255,255,255,0.12);
          }
          .intake-table thead th:last-child { border-right: 0; }
          .intake-table thead .bn { display: block; font-size: 8.5px; color: rgba(255,255,255,0.7); font-weight: 500; margin-top: 1px; }
          .intake-table tbody td {
            padding: 5px 10px;
            border-top: 1px solid var(--border);
            border-right: 1px solid var(--border);
            font-weight: 600;
            vertical-align: middle;
          }
          .intake-table tbody td:last-child { border-right: 0; }
          .intake-table tbody tr { position: relative; }
          .intake-table tbody td:first-child { border-left: 3px solid var(--row-accent, transparent); }
          .intake-table tbody tr.row-inside-dhaka    { --row-accent: #15803d; background: #f0fdf4; }
          .intake-table tbody tr.row-outside-dhaka   { --row-accent: #6d28d9; background: #faf5ff; }
          .intake-table tbody tr.row-duplicate       { --row-accent: #b91c1c; background: #fef2f2; }
          .intake-table tbody tr.row-wrong-number    { --row-accent: #b45309; background: #fffbeb; }
          .intake-table tbody tr.row-invalid-address { --row-accent: #b45309; background: #fffbeb; }
          .intake-table tbody tr.row-out-of-stock    { --row-accent: #b45309; background: #fffbeb; }
          .intake-table tbody tr.row-cancelled       { --row-accent: #b91c1c; background: #fef2f2; }
          .intake-table tbody tr.row-other           { --row-accent: #334155; background: #f8fafc; }
          .intake-table .count {
            text-align: right;
            font-variant-numeric: tabular-nums;
            font-weight: 800;
            color: var(--text);
            font-size: 12px;
          }
          .intake-table .note {
            color: var(--text-secondary);
            font-size: 10px;
            font-weight: 500;
            max-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .intake-table .ordernums {
            color: var(--text);
            font-size: 10px;
            font-weight: 700;
            font-family: ui-monospace, "SF Mono", Menlo, monospace;
            max-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .intake-table tr { page-break-inside: avoid; break-inside: avoid; }

          /* ===== "Total Order From PDF" banner — sits above the breakdown.
             Matches the brand palette so it reads as part of the same report. */
          .pdf-total-banner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin: 0 0 8px;
            padding: 10px 14px;
            border-radius: 6px;
            border: 1px solid var(--border);
            border-left: 4px solid var(--accent);
            background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%);
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .pdf-total-text { display: flex; flex-direction: column; line-height: 1.15; }
          .pdf-total-text .en {
            font-size: 12px; font-weight: 800; color: var(--text); letter-spacing: -0.1px;
          }
          .pdf-total-text .bn {
            font-size: 10px; color: var(--muted); font-weight: 600; margin-top: 2px;
          }
          .pdf-total-value {
            font-size: 22px; font-weight: 800; color: var(--accent);
            font-variant-numeric: tabular-nums; letter-spacing: -0.5px;
            line-height: 1;
          }

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
          .orders-table .items {
            font-size: 10px;
            color: var(--text-secondary);
            font-weight: 600;
            margin-top: 3px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.2;
          }
          .orders-table .reason {
            font-size: 9px;
            color: var(--text-muted);
            font-style: italic;
            font-weight: 500;
            margin-top: 3px;
            max-width: 100px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.2;
          }

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
          <strong>Daily Summary · {orders.length} orders</strong>
          {!autoPrint && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Click <b>Download PDF</b>, pick destination <i>Save as PDF</i>, keep{" "}
              <b>Background graphics ON</b> for color. File will be named{" "}
              <code style={codeStyle}>{document.title}</code>. Saved snapshots
              above can be reopened any time to re-download the same report.
            </div>
          )}
        </div>

        {listView && (
          // Manual intake — operator's breakdown of orders received today via
          // phone / WhatsApp / PDF list. Each row = one category + count, so
          // the operator can record both the good orders (Inside Dhaka /
          // Outside Dhaka) and the rejected ones (duplicate, wrong number,
          // out of stock, etc.) in one place. Saved per-day in localStorage.
          <ManualIntakeEditor
            rows={intakeRows}
            onChange={setIntakeRows}
            systemCount={orders.length}
            pdfTotal={pdfTotal}
            onPdfTotalChange={setPdfTotal}
            snapshots={snapshots}
            onSaveSnapshot={saveSnapshot}
            onLoadSnapshot={loadSnapshot}
            onDeleteSnapshot={deleteSnapshot}
          />
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => window.print()}>
            {autoPrint ? "Print" : "Download PDF"}
          </button>
          <button className="btn btn-secondary" onClick={() => window.close()}>
            Close
          </button>
        </div>
      </div>

      <div className={listView ? "list-wrap" : undefined} style={{ padding: 12 }}>
        <h1 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 4px" }}>
          {settings?.businessName || ""} —{" "}
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
            intakeRows={intakeRows}
            pdfTotal={pdfTotal}
            expenseSummary={expenseSummary}
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

/** On-screen editor for the manual-intake breakdown. Each row = category
 *  dropdown + count input + remove button. The component renders a compact
 *  list inside the no-print toolbar and shows derived metric chips (Total,
 *  Outside Dhaka, To Enter) so the operator can sanity-check before
 *  printing. Also owns the "Save snapshot" + "Saved snapshots" UI for
 *  named, persistent copies of the breakdown. */
function ManualIntakeEditor({
  rows,
  onChange,
  systemCount,
  pdfTotal,
  onPdfTotalChange,
  snapshots,
  onSaveSnapshot,
  onLoadSnapshot,
  onDeleteSnapshot,
}: {
  rows: IntakeRow[];
  onChange: (next: IntakeRow[]) => void;
  systemCount: number;
  pdfTotal: string;
  onPdfTotalChange: (next: string) => void;
  snapshots: IntakeSnapshot[];
  onSaveSnapshot: (name: string) => void;
  onLoadSnapshot: (snap: IntakeSnapshot) => void;
  onDeleteSnapshot: (id: string) => void;
}) {
  const updateRow = (uid: string, patch: Partial<IntakeRow>) => {
    onChange(rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  };
  const removeRow = (uid: string) => onChange(rows.filter((r) => r.uid !== uid));
  const addRow = () => {
    // Pick the first category that isn't already in use so we don't pile up
    // duplicates by accident. Falls back to the first preset if everything
    // is already on screen.
    const used = new Set(rows.map((r) => r.category));
    const fresh =
      INTAKE_CATEGORIES.find((c) => !used.has(c.id)) ?? INTAKE_CATEGORIES[0];
    onChange([
      ...rows,
      { uid: crypto.randomUUID(), category: fresh.id, count: "", note: "", orderNumbers: "" },
    ]);
  };

  // Derived totals — memoized so typing in inputs doesn't re-compute
  // unnecessarily.
  const totals = useMemo(() => {
    let total = 0;
    let outsideDhaka = 0;
    let willEnter = 0;
    for (const r of rows) {
      const n = rowCount(r);
      total += n;
      if (r.category === "outside_dhaka") outsideDhaka += n;
      if (INTAKE_CATEGORY_KIND[r.category] === "enter") willEnter += n;
    }
    return { total, outsideDhaka, willEnter };
  }, [rows]);
  const toEnter = Math.max(0, totals.willEnter - systemCount);

  // Save-snapshot dialog state. When non-null, an inline prompt is rendered.
  const [snapPrompt, setSnapPrompt] = useState<{ open: boolean; name: string }>({
    open: false,
    name: "",
  });
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);

  const openSaveDialog = () => {
    const stamp = new Date().toLocaleString("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    setSnapPrompt({ open: true, name: `Daily Summary — ${stamp}` });
  };
  const confirmSave = () => {
    onSaveSnapshot(snapPrompt.name);
    setSnapPrompt({ open: false, name: "" });
  };

  const inputBase: React.CSSProperties = {
    padding: "4px 8px",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text-primary)",
    fontSize: 12,
  };
  const selectStyle: React.CSSProperties = { ...inputBase, minWidth: 150 };
  const countStyle: React.CSSProperties = {
    ...inputBase,
    width: 72,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  };
  const noteStyle: React.CSSProperties = { ...inputBase, width: "100%" };
  const orderNumsStyle: React.CSSProperties = {
    ...inputBase,
    width: "100%",
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    fontSize: 11,
  };

  return (
    <div
      className="manual-intake-bar"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "8px 10px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-elev, rgba(255,255,255,0.02))",
        flex: "1 1 360px",
        minWidth: 360,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          Manual Intake
          <span style={{ marginLeft: 6, fontWeight: 500, color: "var(--text-muted)", textTransform: "none", letterSpacing: 0 }}>
            — orders received today (PDF / phone / WhatsApp)
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={openSaveDialog}
            disabled={rows.length === 0}
            title="Save the current breakdown under a name so you can reopen and re-download later"
            style={{
              ...inputBase,
              cursor: rows.length === 0 ? "not-allowed" : "pointer",
              fontWeight: 700,
              padding: "4px 12px",
              color: "var(--text-primary)",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              opacity: rows.length === 0 ? 0.55 : 1,
            }}
          >
            Save snapshot
          </button>
          <button
            type="button"
            onClick={addRow}
            style={{
              ...inputBase,
              cursor: "pointer",
              fontWeight: 700,
              padding: "4px 12px",
              color: "var(--accent-green)",
              background: "var(--tint-brand-18)",
              border: "1px solid color-mix(in srgb, var(--color-brand) 40%, transparent)",
            }}
          >
            + Add row
          </button>
        </div>
      </div>

      {/* "Total Order From PDF" — the raw count of orders received from the
          PDF / phone / WhatsApp list. Kept separate from the per-category
          breakdown so the operator can record the demand volume even before
          categorizing every row. Shows up in the printed PDF as its own
          section header above the breakdown table. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          border: "1px solid color-mix(in srgb, var(--color-brand) 40%, transparent)",
          borderRadius: 8,
          background: "var(--tint-brand-12)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: 0.2,
            }}
          >
            Total Order From PDF
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              marginTop: 1,
              fontWeight: 600,
            }}
          >
            মোট পিডিএফ অর্ডার · raw count from the list
          </div>
        </div>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          aria-label="Total Order From PDF"
          value={pdfTotal}
          onChange={(e) =>
            onPdfTotalChange(e.target.value.replace(/[^\d]/g, ""))
          }
          placeholder="0"
          style={{
            ...inputBase,
            width: 110,
            padding: "6px 10px",
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
            fontSize: 18,
            fontWeight: 800,
            color: "var(--accent-green)",
            background: "var(--bg-card)",
            border: "1px solid color-mix(in srgb, var(--color-brand) 50%, transparent)",
          }}
        />
      </div>

      {/* Inline save-snapshot prompt — name + Save / Cancel. */}
      {snapPrompt.open && (
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            padding: 6,
            border: "1px solid color-mix(in srgb, var(--color-brand) 40%, transparent)",
            background: "var(--tint-brand-12)",
            borderRadius: 6,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>
            Snapshot name:
          </span>
          <input
            type="text"
            value={snapPrompt.name}
            onChange={(e) => setSnapPrompt((p) => ({ ...p, name: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmSave();
              if (e.key === "Escape") setSnapPrompt({ open: false, name: "" });
            }}
            autoFocus
            style={{ ...inputBase, flex: 1 }}
          />
          <button
            type="button"
            onClick={confirmSave}
            disabled={!snapPrompt.name.trim()}
            style={{
              ...inputBase,
              cursor: snapPrompt.name.trim() ? "pointer" : "not-allowed",
              fontWeight: 700,
              padding: "4px 12px",
              color: "var(--accent-green)",
              background: "var(--tint-brand-18)",
              border: "1px solid color-mix(in srgb, var(--color-brand) 40%, transparent)",
              opacity: snapPrompt.name.trim() ? 1 : 0.55,
            }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setSnapPrompt({ open: false, name: "" })}
            style={{
              ...inputBase,
              cursor: "pointer",
              padding: "4px 10px",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Column headers (subtle, just to label each row's sub-inputs) */}
      {rows.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px",
            gap: 6,
            fontSize: 10,
            fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: 0.4,
            paddingLeft: 2,
          }}
        >
          <span>Category · Note</span>
          <span style={{ textAlign: "right" }}>Count</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.length === 0 && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              padding: "8px 0",
              fontStyle: "italic",
            }}
          >
            No rows yet — click <b>+ Add row</b> to start the breakdown.
          </div>
        )}
        {rows.map((r) => (
          // Two stacked sub-rows per intake entry:
          //   line 1: category dropdown · count · ×
          //   line 2: order numbers · note
          // Keeps each input readable while letting the operator paste a long
          // list of order numbers into one row without breaking layout.
          <div
            key={r.uid}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: 6,
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-card)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 80px 28px",
                gap: 6,
                alignItems: "center",
              }}
            >
              <select
                aria-label="Category"
                value={r.category}
                onChange={(e) =>
                  updateRow(r.uid, { category: e.target.value as IntakeCategory })
                }
                style={selectStyle}
              >
                {INTAKE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                aria-label="Count"
                value={r.count}
                onChange={(e) =>
                  updateRow(r.uid, { count: e.target.value.replace(/[^\d]/g, "") })
                }
                placeholder="0"
                style={countStyle}
              />
              <button
                type="button"
                onClick={() => removeRow(r.uid)}
                aria-label="Remove row"
                title="Remove row"
                style={{
                  width: 28,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1fr",
                gap: 6,
              }}
            >
              <input
                type="text"
                aria-label="Order numbers"
                value={r.orderNumbers ?? ""}
                onChange={(e) => updateRow(r.uid, { orderNumbers: e.target.value })}
                placeholder="Order #s (comma- or space-separated)"
                style={orderNumsStyle}
              />
              <input
                type="text"
                aria-label="Note"
                value={r.note ?? ""}
                onChange={(e) => updateRow(r.uid, { note: e.target.value })}
                placeholder={
                  r.category === "other" ? "What happened?" : "Note (optional)"
                }
                style={noteStyle}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Derived metric chips */}
      {rows.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            paddingTop: 4,
            borderTop: "1px dashed var(--border)",
          }}
        >
          <Chip label="Total received" value={totals.total} tone="slate" />
          <Chip
            label="Outside Dhaka"
            value={totals.outsideDhaka}
            tone="violet"
          />
          <Chip
            label="To enter"
            value={toEnter}
            tone={toEnter > 0 ? "amber" : "green"}
            title={
              toEnter > 0
                ? `${totals.willEnter - toEnter} of ${totals.willEnter} already entered (${systemCount} in system)`
                : `All ${totals.willEnter} accepted orders are in the system`
            }
          />
        </div>
      )}

      {/* Saved snapshots panel — collapsed by default so the editor stays
          compact for daily use. Operators click to expand when they want to
          reopen a previous breakdown. */}
      <div
        style={{
          borderTop: snapshots.length > 0 ? "1px dashed var(--border)" : "none",
          paddingTop: snapshots.length > 0 ? 6 : 0,
        }}
      >
        <button
          type="button"
          onClick={() => setSnapshotsOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: "4px 6px",
            background: "transparent",
            border: 0,
            cursor: "pointer",
            color: "var(--text-secondary)",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          <span>Saved snapshots ({snapshots.length})</span>
          <span style={{ fontSize: 13, lineHeight: 1 }}>
            {snapshotsOpen ? "−" : "+"}
          </span>
        </button>
        {snapshotsOpen && snapshots.length === 0 && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              padding: "4px 6px",
              fontStyle: "italic",
            }}
          >
            No snapshots yet. Use <b>Save snapshot</b> to keep the current
            breakdown for later.
          </div>
        )}
        {snapshotsOpen && snapshots.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginTop: 4,
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {snapshots.map((s) => {
              const stamp = new Date(s.savedAt).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });
              const filledRows = s.rows.filter((r) => rowCount(r) > 0).length;
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 6px",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    background: "var(--bg-card)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={s.name}
                    >
                      {s.name}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginTop: 1,
                      }}
                    >
                      {stamp}
                      {s.date && ` · for ${s.date}`}
                      {" · "}
                      {filledRows} row{filledRows === 1 ? "" : "s"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onLoadSnapshot(s)}
                    title="Load this snapshot into the editor"
                    style={{
                      ...inputBase,
                      cursor: "pointer",
                      fontWeight: 700,
                      padding: "3px 10px",
                      color: "var(--accent-green)",
                      background: "var(--tint-brand-18)",
                      border: "1px solid color-mix(in srgb, var(--color-brand) 40%, transparent)",
                    }}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete snapshot "${s.name}"?`)) onDeleteSnapshot(s.id);
                    }}
                    aria-label={`Delete snapshot ${s.name}`}
                    title="Delete snapshot"
                    style={{
                      width: 28,
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: 16,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact metric chip used in the manual-intake toolbar. */
function Chip({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: number;
  tone: "slate" | "violet" | "amber" | "green";
  title?: string;
}) {
  const palette: Record<string, { color: string; bg: string; border: string }> = {
    slate:  { color: "var(--text-secondary)", bg: "var(--bg-hover)",          border: "var(--border)" },
    violet: { color: "#6d28d9",               bg: "#faf5ff",                   border: "#ddd6fe" },
    amber:  { color: "var(--accent-amber)",    bg: "color-mix(in srgb, var(--color-warning) 18%, transparent)", border: "color-mix(in srgb, var(--color-warning) 50%, transparent)" },
    green:  { color: "var(--accent-green)",    bg: "color-mix(in srgb, var(--color-success) 18%, transparent)", border: "color-mix(in srgb, var(--color-success) 50%, transparent)" },
  };
  const p = palette[tone];
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        background: p.bg,
        color: p.color,
        border: `1px solid ${p.border}`,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      <span style={{ fontWeight: 600, opacity: 0.85 }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{value}</span>
    </span>
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
  intakeRows,
  pdfTotal,
  expenseSummary,
}: {
  orders: Order[];
  mainIds: number[];
  riders: Rider[];
  settings: Settings | null;
  printedDateStr: string;
  todayDateStr: string;
  /** Manual-intake breakdown — see ManualIntakeEditor for the schema. */
  intakeRows: IntakeRow[];
  /** Raw "Total Order From PDF" — operator-entered string (may be empty). */
  pdfTotal: string;
  /** Today's expense summary fetched from /api/expenses/summary. Null while
   *  loading or if the request failed — in that case we skip the section. */
  expenseSummary: {
    total: number;
    count: number;
    byCategory: Array<{ category: string; total: number; count: number }>;
  } | null;
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

  // Cash Collected = sum of `paid` for orders that actually have cash in hand
  // right now. We use `paid` (not `total`) because in-transit / preparing /
// new orders have a `total` but `paid` is still 0 — their cash hasn't
// actually been collected by the rider yet. We also exclude `returned`
// because the system's `paid` field doesn't auto-reconcile refunds (refund
// handling is out of band), so adding it back would double-count cash that
// has physically come back to the customer.
const cashCollected = tableOrders
  .filter((o) => o.status !== "cancelled" && o.status !== "returned")
  .reduce((s, o) => s + o.paid, 0);
const inTransitTotal = tableOrders
  .filter((o) =>
    o.status === "new" ||
    o.status === "confirmed" ||
    o.status === "preparing" ||
    o.status === "out-for-delivery"
  )
  .reduce((s, o) => s + o.total, 0);
const returnedTotal = tableOrders
  .filter((o) => o.status === "returned")
  .reduce((s, o) => s + o.paid, 0);
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

  const businessName = settings?.businessName || "";

  return (
    <div>
      {/* Header band removed — content begins directly with the Order Summary
          section. The page-level <h1> above still shows business name +
          report title and date. */}

      {/* ===== Section: Order Summary ===== */}
      <div className="section-title">
        <span className="en">Order Summary</span>
      </div>

      <div className="kpi-grid">
        <div className="kpi black">
          <div className="label">Total Orders</div>
          <div className="value">{tableOrders.length}</div>
        </div>
        <div className="kpi green">
          <div className="label">Delivered</div>
          <div className="value">{statusCounts.delivered}</div>
        </div>
        <div className="kpi red">
          <div className="label">Cancelled</div>
          <div className="value">{statusCounts.cancelled}</div>
        </div>
        <div className="kpi amber">
          <div className="label">Returned</div>
          <div className="value">{statusCounts.returned}</div>
        </div>
        <div className="kpi blue">
          <div className="label">Cash Collected</div>
          <div className="value" style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 2 }}>
            <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 700 }}>৳</span>
            <span>{cashCollected.toLocaleString("en-IN")}</span>
          </div>
          {(inTransitTotal > 0 || returnedTotal > 0 || cancelledTotal > 0) && (
            <div
              style={{
                fontSize: 9,
                marginTop: 2,
                color: "var(--text-muted)",
                fontWeight: 600,
                lineHeight: 1.3,
              }}
            >
              {inTransitTotal > 0 && (
                <div>৳{inTransitTotal.toLocaleString("en-IN")} pending dispatch</div>
              )}
              {returnedTotal > 0 && (
                <div style={{ color: "#b45309" }}>
                  ৳{returnedTotal.toLocaleString("en-IN")} returned (refund unreconciled)
                </div>
              )}
              {cancelledTotal > 0 && (
                <div style={{ color: "var(--accent-red)" }}>
                  ৳{cancelledTotal.toLocaleString("en-IN")} cancelled
                </div>
              )}
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

      {/* ===== Section: Today's Expenses =====
          Skipped entirely if the expense summary hasn't loaded yet, or if
          there's nothing to show (no entries today). Renders just the
          per-category table — KPI cards removed. */}
      {expenseSummary && expenseSummary.byCategory.length > 0 && (
        <>
          <div className="section-title">
            <span className="en">Today&apos;s Expenses</span>
          </div>

          <table className="intake-table expense-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Category<span className="bn">খাত</span></th>
                <th style={{ textAlign: "right", width: 60 }}>Count<span className="bn">সংখ্যা</span></th>
                <th style={{ textAlign: "right", width: 110 }}>Amount (৳)<span className="bn">পরিমাণ</span></th>
              </tr>
            </thead>
            <tbody>
              {expenseSummary.byCategory.map((c) => (
                <tr key={c.category}>
                  <td>
                    <div
                      style={{
                        fontWeight: 700,
                        color: EXPENSE_CATEGORY_COLORS[c.category] || "var(--text)",
                      }}
                    >
                      {EXPENSE_CATEGORY_LABELS[c.category] || c.category}
                    </div>
                  </td>
                  <td className="count">{c.count}</td>
                  <td className="count" style={{ color: "orangered" }}>
                    ৳{c.total.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ===== Intake breakdown (PDF / phone orders, operator-entered) =====
         No section title on the PDF — the table is self-explanatory. */}
      {(() => {
        // Skip the whole block when there's nothing to show — empty input rows
        // shouldn't add whitespace to the printed report.
        const hasAnyData = intakeRows.some(
          (r) =>
            rowCount(r) > 0 ||
            (r.note ?? "").trim() !== "" ||
            (r.orderNumbers ?? "").trim() !== ""
        );
        if (!hasAnyData && !pdfTotal.trim()) return null;
        return (
          <>
            {/* "Total Order From PDF" section — printed as a single bold line
                above the breakdown table. Renders only when the operator has
                typed a value so the report never shows a stray 0. */}
            {pdfTotal.trim() !== "" && (
              <div className="pdf-total-banner">
                <div className="pdf-total-text">
                  <span className="en">Total Order From PDF</span>
                  <span className="bn">মোট পিডিএফ অর্ডার</span>
                </div>
                <div className="pdf-total-value">{Number(pdfTotal) || 0}</div>
              </div>
            )}

            {hasAnyData && (
              <table className="intake-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Category<span className="bn">ধরন</span></th>
                    <th style={{ textAlign: "right", width: 60 }}>Count<span className="bn">সংখ্যা</span></th>
                    <th style={{ textAlign: "left" }}>Order #s<span className="bn">অর্ডার নং</span></th>
                    <th style={{ textAlign: "left" }}>Note<span className="bn">নোট</span></th>
                  </tr>
                </thead>
                <tbody>
                  {intakeRows.map((r) => {
                    const nums = (r.orderNumbers ?? "")
                      .split(/[\s,]+/)
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const noteText = (r.note ?? "").trim();
                    return (
                      <tr key={r.uid} className={`row-${r.category.replace("_", "-")}`}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{INTAKE_CATEGORY_LABEL[r.category]}</div>
                          <div className="bn" style={{ fontSize: 9, color: "var(--muted)", fontWeight: 600, marginTop: 1 }}>
                            {INTAKE_CATEGORY_LABEL_BN[r.category]}
                          </div>
                        </td>
                        <td className="count">{r.count || "—"}</td>
                        <td className="ordernums" title={nums.join(", ") || undefined}>
                          {nums.length === 0 ? (
                            <span style={{ color: "var(--muted)" }}>—</span>
                          ) : nums.length <= 2 ? (
                            nums.join(", ")
                          ) : (
                            <>
                              <span style={{ fontWeight: 700 }}>{nums.slice(0, 2).join(", ")}</span>
                              <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                                {" "}+{nums.length - 2} more
                              </span>
                            </>
                          )}
                        </td>
                        <td className="note" title={noteText || undefined}>
                          {noteText || <span style={{ color: "var(--muted)" }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        );
      })()}

      {/* ===== Section: Order Details ===== */}
      <div className="section-title">
        <span className="en">Order Details</span>
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
            <th style={{ width: 90, textAlign: "right" }}>
              Amount<span className="bn">পরিমাণ (৳)</span>
            </th>
            <th style={{ width: 85 }}>
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
                {o.items.length > 0 && (
                  <div
                    className="items"
                    title={o.items
                      .map((it) => `${it.qty}${it.unit === "pcs" ? "pc" : "kg"} ${it.nameBn || it.name}`)
                      .join(" · ")}
                  >
                    {o.items
                      .map((it) => `${it.qty}${it.unit === "pcs" ? "pc" : "kg"} ${it.nameBn || it.name}`)
                      .join(" · ")}
                  </div>
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
                {(o.status === "cancelled" || o.status === "returned") && (
                  <div
                    className="reason"
                    title={
                      o.status === "cancelled"
                        ? `Cancelled: ${o.cancelReason || "(no reason given)"}`
                        : `Returned: ${o.returnReason || "(no reason given)"}`
                    }
                  >
                    {(
                      o.status === "cancelled" ? o.cancelReason : o.returnReason
                    ) || <em style={{ color: "var(--text-muted)", fontStyle: "italic" }}>(no reason)</em>}
                  </div>
                )}
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
  background: "var(--tint-brand-12)",
  color: "#15803d",
  border: "1px solid var(--tint-brand-25)",
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