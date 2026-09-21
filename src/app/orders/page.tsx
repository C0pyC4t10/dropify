"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Printer, Check, X, Trash2, Truck, Inbox, FileSpreadsheet, FileText, Map, Bike, Compass, Download, Calendar } from "lucide-react";
import type { Order, Product, Customer, Settings, OrderStatus, Rider } from "@/lib/types";
import { STATUS_LABELS, formatMoney, SOURCE_LABELS, SOURCE_COLORS, PAYMENT_LABELS, bdParts, ALL_CLUSTERS, CLUSTER_COLORS, CLUSTER_SHORT, CLUSTER_LABELS } from "@/lib/ui";
import { StatusBadge } from "@/components/status-badge";
import { OrderForm } from "@/components/order-form";
import { ExportMenu, type ExportColumn } from "@/components/export-menu";
import { exportXLSX } from "@/lib/exports";
import { flattenOrdersToRows, aggregateOrdersBySku, type OrderLineRow, type AggregateSkuRow } from "@/lib/order-export";
import { downloadPrepListPDF } from "@/lib/prep-list";
import { CancelOrderModal } from "@/components/cancel-order-modal";

const FILTERS: Array<OrderStatus | "all"> = [
  "all",
  "new",
  "confirmed",
  "preparing",
  "out-for-delivery",
  "delivered",
  "cancelled",
  "returned",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface MonthOption {
  /** "YYYY-MM" or "all" or "no-date" */
  key: string;
  /** "September 2026" or "All months" */
  label: string;
  /** Orders that fall into this month (across all status / cluster /
   *  search / today filters — purely the calendar slice). */
  count: number;
  /** "2026-09" only present for YYYY-MM keys; useful for sorting. */
  ym?: string;
}

/** Distinct months present in `orders`, newest first. Used to populate
 *  the month picker on the All tab so the operator can see one month at
 *  a time instead of every month stacked in one scroll. */
function listMonths(orders: Order[]): MonthOption[] {
  // Note: using a plain Record instead of `new Map` — the file imports
  // `Map` from lucide-react (used as a route-map icon elsewhere), which
  // shadows the global Map class and breaks the constructor signature.
  const counts: Record<string, number> = {};
  let total = 0;
  for (const o of orders) {
    const raw = (o.date || "").trim();
    if (/^\d{4}-\d{2}/.test(raw)) {
      const ym = raw.slice(0, 7);
      counts[ym] = (counts[ym] ?? 0) + 1;
      total += 1;
    } else {
      counts["no-date"] = (counts["no-date"] ?? 0) + 1;
      total += 1;
    }
  }
  // Newest month first; "no-date" goes last so it doesn't steal focus.
  const keys = Object.keys(counts);
  keys.sort((a, b) => {
    if (a === "no-date") return 1;
    if (b === "no-date") return -1;
    return b.localeCompare(a);
  });
  const out: MonthOption[] = keys.map((k) => {
    if (k === "no-date") {
      return { key: "no-date", label: "No date", count: counts[k] ?? 0 };
    }
    const [y, m] = k.split("-").map(Number);
    return {
      key: k,
      ym: k,
      label: `${MONTH_NAMES[m - 1]} ${y}`,
      count: counts[k] ?? 0,
    };
  });
  // Always offer an "All months" option at the top so the operator can
  // still see every row when they want to.
  return [{ key: "all", label: "All months", count: total }, ...out];
}

export default function OrdersPage() {
  // Next.js 16 requires useSearchParams() to live inside a Suspense boundary
  // so the page can be prerendered without bailing out at build time.
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Loading…</div>}>
      <OrdersPageContent />
    </Suspense>
  );
}

function OrdersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [clusterFilter, setClusterFilter] = useState<"all" | "DHK-E" | "DHK-NW" | "DHK-CW" | "DHK-SE">("all");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const [showBulkCancel, setShowBulkCancel] = useState(false);
  const [showPlanRoutePicker, setShowPlanRoutePicker] = useState(false);
  const [todayOnly, setTodayOnly] = useState(false);

  // BD-local (UTC+6) "today" as YYYY-MM-DD. Used for the Today filter pill.
  const todayDateStr = useMemo(() => {
    const bd = new Date(new Date().getTime() + 6 * 60 * 60 * 1000);
    return bd.toISOString().slice(0, 10);
  }, []);

  // Live count of pending-approval orders (for the approval-queue badge).
  const pendingCount = useMemo(
    () => orders.filter((o) => o.status === "pending-approval").length,
    [orders]
  );

  const load = useCallback(async () => {
    try {
      const [o, p, c, s, r] = await Promise.all([
        fetch("/api/orders").then((r) => r.json()),
        fetch("/api/products").then((r) => r.json()),
        fetch("/api/customers").then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json()),
        fetch("/api/riders").then((r) => r.json()),
      ]);
      setOrders(o);
      setProducts(p);
      setCustomers(c);
      setSettings(s);
      setRiders(r);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    // `?today=1` — auto-toggle the Today filter when the URL says so.
    // Lets the header's "Today" shortcut (and any bookmarked link) jump
    // straight into the today view.
    if (searchParams.get("today") === "1" && !todayOnly) {
      setTodayOnly(true);
    }

    const s = searchParams.get("status");
    if (s && FILTERS.includes(s as OrderStatus | "all")) {
      setFilter(s as OrderStatus | "all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Distinct months present in the FULL orders list (not the filtered
  // subset — we want the picker to show every month that has any data,
  // even when the user has typed a search or picked a cluster).
  // Memoizing so the picker doesn't reflow on every search keystroke.
  const monthOptions = useMemo(() => listMonths(orders), [orders]);

  // Most recent real month on the page = "2026-09" once orders arrive.
  // We keep this as the picker default whenever the user hasn't picked
  // anything themselves yet, so re-opening /orders lands them on the
  // actionable "this month" view rather than dumping every month in
  // their face.
  const mostRecentMonth = monthOptions.find((m) => !!m.ym)?.key ?? null;
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  // Track whether the user has clicked a month pill themselves. We
  // default to the most recent real month on first paint, but never
  // overwrite a click they made.
  const userPickedMonth = useRef(false);
  useEffect(() => {
    if (!userPickedMonth.current && mostRecentMonth) {
      setMonthFilter(mostRecentMonth);
    }
  }, [mostRecentMonth]);

  const effectiveMonthFilter = monthFilter ?? mostRecentMonth ?? "all";

  const filtered = useMemo(() => {
    const list = orders.filter((o) => {
      // pending-approval orders live at /orders/approval — never mixed here.
      if (o.status === "pending-approval") return false;
      // "Today" pill — show every order scheduled for today, regardless of
      // status. Includes new / preparing / out-for-delivery as well as
      // delivered / cancelled / returned so ops always sees the full day's
      // queue in one view.
      if (todayOnly && o.date !== todayDateStr) return false;
      if (filter !== "all" && o.status !== filter) return false;
      if (clusterFilter !== "all" && o.cluster !== clusterFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        const hit =
          o.orderNo.toLowerCase().includes(q) ||
          (o.customerName || "").toLowerCase().includes(q) ||
          (o.customerPhone || "").includes(q) ||
          (o.area || "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      // Month chip — when set to a YYYY-MM or "no-date" key, narrow to
      // that month. "all" keeps every month in view. (We don't apply
      // this when todayOnly is on, since the today pill already
      // narrows to a single day — adding a month filter on top
      // would be redundant.)
      if (!todayOnly && effectiveMonthFilter !== "all") {
        const ym = (o.date || "").slice(0, 7);
        const bucket = /^\d{4}-\d{2}/.test(ym) ? ym : "no-date";
        if (bucket !== effectiveMonthFilter) return false;
      }
      return true;
    });
    if (filter === "delivered") {
      return [...list].sort((a, b) => {
        if (!a.deliveredAt && !b.deliveredAt) return b.id - a.id;
        if (!a.deliveredAt) return 1;
        if (!b.deliveredAt) return -1;
        return b.deliveredAt.localeCompare(a.deliveredAt) || b.id - a.id;
      });
    }
    return list;
  }, [orders, filter, clusterFilter, query, todayOnly, todayDateStr, effectiveMonthFilter]);

  const todayCount = useMemo(
    () =>
      orders.filter((o) => {
        if (o.status === "pending-approval") return false;
        return o.date === todayDateStr;
      }).length,
    [orders, todayDateStr]
  );

  // Totals row aggregates for the tfoot
  const totalsKg = filtered.reduce(
    (s, o) => s + o.items.reduce((s2, it) => s2 + (it.unit === "kg" ? it.qty : 0), 0),
    0
  );
  const totalsPcs = filtered.reduce(
    (s, o) => s + o.items.reduce((s2, it) => s2 + (it.unit === "pcs" ? it.qty : 0), 0),
    0
  );
  const totalsAmount = filtered.reduce((s, o) => s + o.total, 0);
  const totalsPaid = filtered.reduce((s, o) => s + o.paid, 0);
  const totalsDue = totalsAmount - totalsPaid;
  const qtySummary = [
    totalsKg > 0 ? `${totalsKg.toLocaleString("en-IN")} kg` : null,
    totalsPcs > 0 ? `${totalsPcs.toLocaleString("en-IN")} pcs` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Aggregated rows for the inline prep list. Sums kg and pcs separately per
  // product across the currently-filtered orders (so no doubles).
  const aggRows = useMemo(
    () => aggregateOrdersBySku(filtered),
    [filtered]
  );

  const [showPrep, setShowPrep] = useState(false);

  const allSelected = filtered.length > 0 && filtered.every((o) => selectedIds.has(o.id));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((o) => o.id)));
    }
  };

  // Build export columns from currently filtered orders
  const orderExportCols: ExportColumn<Order>[] = [
    { header: "Order #", get: (o) => o.orderNo },
    { header: "Date", get: (o) => o.date },
    { header: "Customer", get: (o) => o.customerName },
    { header: "Phone", get: (o) => o.customerPhone },
    { header: "Area", get: (o) => o.area },
    { header: "Address", get: (o) => o.address },
    { header: "Items", get: (o) => o.items.map((it) => `${it.qty}${it.unit} ${it.nameBn || it.name}`).join(", "), format: (v) => String(v ?? "").replace(/, /g, "\n") },
    { header: "Qty (kg)", get: (o) => o.items.reduce((s, it) => s + (it.unit === "kg" ? it.qty : 0), 0), total: "sum" },
    { header: "Subtotal", get: (o) => o.subtotal, total: "sum" },
    { header: "Delivery", get: (o) => o.deliveryFee, total: "sum" },
    { header: "Discount", get: (o) => o.discount, total: "sum" },
    { header: "Total", get: (o) => o.total, total: "sum" },
    { header: "Paid", get: (o) => o.paid, total: "sum" },
    { header: "Due", get: (o) => Math.max(0, o.total - o.paid), total: "sum" },
    { header: "Payment", get: (o) => PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod },
    { header: "Status", get: (o) => STATUS_LABELS[o.status] || o.status },
    { header: "Source", get: (o) => SOURCE_LABELS[o.source] || o.source },
    { header: "Note", get: (o) => o.note },
  ];

  // Item-level export: one row per line item, with order context repeated.
  // kg and pcs are split into separate columns so Excel can SUM each independently.
  const itemExportCols: ExportColumn<OrderLineRow>[] = [
    { header: "Order #", get: (r) => r.orderNo },
    { header: "Date", get: (r) => r.date },
    { header: "Customer", get: (r) => r.customerName },
    { header: "Phone", get: (r) => r.customerPhone },
    { header: "Area", get: (r) => r.area },
    { header: "Address", get: (r) => r.address },
    { header: "Status", get: (r) => r.status },
    { header: "Source", get: (r) => r.source },
    { header: "Payment", get: (r) => r.paymentMethod },
    { header: "Item", get: (r) => r.productNameBn || r.productName },
    { header: "Qty (kg)", get: (r) => (r.unit === "kg" ? r.qty : 0), total: "sum" },
    { header: "Qty (pcs)", get: (r) => (r.unit === "pcs" ? r.qty : 0), total: "sum" },
    { header: "Unit Price", get: (r) => r.unitPrice },
    { header: "Line Total", get: (r) => r.lineTotal, total: "sum" },
    { header: "Order Subtotal", get: (r) => r.orderSubtotal },
    { header: "Order Delivery", get: (r) => r.orderDeliveryFee },
    { header: "Order Discount", get: (r) => r.orderDiscount },
    { header: "Order Total", get: (r) => r.orderTotal },
  ];

  const exportItemsXLSX = () => {
    const flat = flattenOrdersToRows(exportRows);
    exportXLSX(flat, itemExportCols, {
      filename: hasSelection ? `orders-items-selected-${selectedIds.size}` : "orders-items",
      title: "Order Items Report",
      subtitle: exportSubtitle,
      businessName: settings?.businessName || "",
      tagline: settings?.tagline || "",
    });
  };

  // Aggregate export: one row per (date, product), summed. No customer repeats.
  // Best for daily inventory prep — tells you "today I need 5kg of goat meat".
  const aggregateExportCols: ExportColumn<AggregateSkuRow>[] = [
    { header: "Product", get: (r) => (r.productNameBn || r.productName || "").trim() },
    { header: "Total kg", get: (r) => r.totalKg, total: "sum", format: (v) => (v ? Number(v).toFixed(2).replace(/\.?0+$/, "") : "0") },
    { header: "Total pcs", get: (r) => r.totalPcs, total: "sum", format: (v) => (v ? Number(v).toString() : "0") },
    { header: "First seen", get: (r) => r.firstDate },
    { header: "Last seen", get: (r) => r.lastDate },
    { header: "# Orders", get: (r) => r.orderCount, total: "sum" },
    { header: "Line Total (BDT)", get: (r) => r.lineTotal, total: "sum" },
  ];
  const exportAggregateXLSX = () => {
    const rows = aggregateOrdersBySku(exportRows);
    exportXLSX(rows, aggregateExportCols, {
      filename: hasSelection ? `inventory-aggregate-selected-${selectedIds.size}` : "inventory-aggregate",
      title: "Inventory Aggregate (by product, all dates)",
      subtitle: exportSubtitle,
      businessName: settings?.businessName || "",
      tagline: settings?.tagline || "",
    });
  };

  const filterLabel = filter === "all" ? "all orders" : STATUS_LABELS[filter] + " orders";

  // Export scope: if user has selected specific orders, export those; otherwise export all filtered.
  const hasSelection = selectedIds.size > 0;
  const exportRows = hasSelection
    ? filtered.filter((o) => selectedIds.has(o.id))
    : filtered;
  const exportSubtitle = hasSelection
    ? `${selectedIds.size} selected of ${filtered.length}`
    : `${filterLabel}${query ? ` · search: "${query}"` : ""}`;

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkAction = async (action: "confirm" | "delivered" | "cancel" | "return" | "delete", reason?: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (action === "delete") {
      if (!confirm(`Delete ${ids.length} order${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    }
    setBulkBusy(true);
    setBulkMsg("");
    try {
      const res = await fetch("/api/orders/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action, cancelReason: reason, returnReason: reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk action failed");
      setBulkMsg(`${ids.length} order${ids.length !== 1 ? "s" : ""} ${action}ed.`);
      setSelectedIds(new Set());
      load();
      setTimeout(() => setBulkMsg(""), 3000);
    } catch (e) {
      setBulkMsg(String(e));
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkPrint = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    // Open a single consolidated batch print page in a new tab — rider
    // gets one sheet with all selected orders, each with its own signature
    // block, plus a batch total at the bottom. Auto-prints on load.
    window.open(`/orders/print-batch?ids=${ids.join(",")}`, "_blank");
  };

  const downloadTodayDelivered = () => {
    // Main report = ALL orders scheduled for today (BD date), any status
    // (new / confirmed / preparing / out-for-delivery / delivered / cancelled
    // / returned). Matches the in-page "Today" filter so the print-out is
    // the full day's queue, not just the delivered subset.
    const allTodayIds = orders
      .filter(
        (o) => o.date === todayDateStr && o.status !== "pending-approval"
      )
      .map((o) => o.id);
    if (allTodayIds.length === 0) {
      alert(`No orders found for today (${todayDateStr}).`);
      return;
    }
    const params = new URLSearchParams({
      ids: allTodayIds.join(","),
      autoprint: "0",
      view: "list",
      today: todayDateStr,
    });
    window.open(`/orders/print-batch?${params.toString()}`, "_blank");
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Loading...</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Orders</h1>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href="/orders/approval"
            className="btn btn-secondary"
            style={{
              textDecoration: "none",
              background: pendingCount > 0 ? "color-mix(in srgb, var(--color-warning) 15%, transparent)" : undefined,
              borderColor: pendingCount > 0 ? "color-mix(in srgb, var(--color-warning) 50%, transparent)" : undefined,
              color: pendingCount > 0 ? "var(--accent-amber)" : undefined,
            }}
          >
            <Inbox size={15} />
            WP Approval
            {pendingCount > 0 && (
              <span
                style={{
                  marginLeft: 6,
                  background: "var(--accent-amber)",
                  color: "white",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "1px 7px",
                  borderRadius: 999,
                  minWidth: 20,
                  textAlign: "center",
                }}
              >
                {pendingCount}
              </span>
            )}
          </Link>
          <button
            className="btn btn-secondary"
            onClick={exportItemsXLSX}
            disabled={!filtered || filtered.length === 0}
            title="Export one row per line item, with kg and pcs in separate columns"
          >
            <FileSpreadsheet size={14} color="var(--color-success)" />
            {hasSelection ? `Items XLSX (${selectedIds.size})` : "Items XLSX"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() =>
              void downloadPrepListPDF(
                aggregateOrdersBySku(exportRows),
                settings?.businessName || "",
                exportRows.length
              )
            }
            disabled={!filtered || filtered.length === 0}
            title="Prep List PDF: one row per product with summed kg/pcs, single page"
          >
            <FileText size={14} color="var(--color-danger)" />
            Prep PDF
          </button>
          <button
            className="btn btn-secondary"
            onClick={exportAggregateXLSX}
            disabled={!filtered || filtered.length === 0}
            title="Aggregate by date+product: one row per (date, sku) with summed kg and pcs"
          >
            <FileSpreadsheet size={14} color="var(--color-success)" />
            {hasSelection ? `Inventory (${selectedIds.size})` : "Inventory"}
          </button>
          <ExportMenu
            rows={exportRows}
            cols={orderExportCols}
            filename={hasSelection ? "orders-selected" : "orders"}
            title="Orders Report"
            subtitle={exportSubtitle}
            orientation="landscape"
            businessName={settings?.businessName || ""}
            tagline={settings?.tagline || ""}
            label={hasSelection ? `Export ${selectedIds.size} selected` : "Export"}
          />
          <Link href="/orders/quick" className="btn btn-secondary" style={{ textDecoration: "none" }}>
            <Plus size={15} /> Quick Add
          </Link>
          <Link href="/orders/new" className="btn btn-primary" style={{ textDecoration: "none" }}>
            <Plus size={15} /> New Order
          </Link>
        </div>
      </div>

      <div className="filter-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                router.replace(f === "all" ? "/orders" : `/orders?status=${f}`, { scroll: false });
              }}
              className="btn"
              style={{
                fontSize: 12,
                background: filter === f ? "var(--tint-brand-18)" : "var(--bg-card)",
                color: filter === f ? "var(--accent-green)" : "var(--text-secondary)",
                border: `1px solid ${filter === f ? "color-mix(in srgb, var(--color-brand) 40%, transparent)" : "var(--border)"}`,
              }}
            >
              {f === "all" ? "All" : STATUS_LABELS[f]}
            </button>
          ))}
          {/* Cluster filter pills */}
          <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 4px" }} />
          <button
            onClick={() => setClusterFilter("all")}
            className="btn"
            style={{
              fontSize: 12,
              background: clusterFilter === "all" ? "rgba(59,130,246,0.18)" : "var(--bg-card)",
              color: clusterFilter === "all" ? "var(--accent-blue)" : "var(--text-secondary)",
              border: `1px solid ${clusterFilter === "all" ? "rgba(59,130,246,0.4)" : "var(--border)"}`,
            }}
          >
            All Clusters
          </button>
          {ALL_CLUSTERS.map((c) => (
            <button
              key={c}
              onClick={() => setClusterFilter(c)}
              className="btn"
              title={CLUSTER_LABELS[c]}
              style={{
                fontSize: 12,
                background: clusterFilter === c ? `${CLUSTER_COLORS[c]}22` : "var(--bg-card)",
                color: clusterFilter === c ? CLUSTER_COLORS[c] : "var(--text-secondary)",
                border: `1px solid ${clusterFilter === c ? `${CLUSTER_COLORS[c]}88` : "var(--border)"}`,
              }}
            >
              {CLUSTER_SHORT[c]}
            </button>
          ))}
          {/* Today toggle — show only orders scheduled for today (any status) */}
          <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 4px" }} />
          <button
            onClick={() => setTodayOnly((v) => !v)}
            className="btn"
            title={`Show all orders scheduled for today (${todayDateStr}) — includes cancelled & returned`}
            style={{
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: todayOnly ? "color-mix(in srgb, var(--color-warning) 18%, transparent)" : "var(--bg-card)",
              color: todayOnly ? "var(--accent-amber)" : "var(--text-secondary)",
              border: `1px solid ${todayOnly ? "color-mix(in srgb, var(--color-warning) 50%, transparent)" : "var(--border)"}`,
            }}
          >
            <Calendar size={12} />
            Today
            {todayCount > 0 && (
              <span
                style={{
                  marginLeft: 2,
                  background: todayOnly ? "var(--accent-amber)" : "var(--bg-hover)",
                  color: todayOnly ? "white" : "var(--text-muted)",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "0 6px",
                  borderRadius: 999,
                  minWidth: 18,
                  textAlign: "center",
                }}
              >
                {todayCount}
              </span>
            )}
          </button>
          <button
            onClick={downloadTodayDelivered}
            disabled={todayCount === 0}
            className="btn"
            title={`Download a combined PDF of all ${todayCount} orders scheduled for today (any status)`}
            style={{
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: todayCount > 0 ? "var(--tint-brand-18)" : "var(--bg-card)",
              color: todayCount > 0 ? "var(--accent-green)" : "var(--text-muted)",
              border: `1px solid ${todayCount > 0 ? "color-mix(in srgb, var(--color-brand) 50%, transparent)" : "var(--border)"}`,
              cursor: todayCount > 0 ? "pointer" : "not-allowed",
              opacity: todayCount === 0 ? 0.6 : 1,
            }}
          >
            <Download size={12} />
            Download Today
          </button>
        </div>
        <div style={{ position: "relative", width: 240 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--text-muted)" }} />
          <input
            placeholder="Search order/customer/phone/area"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>
      </div>

      {/* Month picker — when "All" status tab is active and Today isn't,
          show the operator one month at a time. Newest month first so
          the actionable "this month" view is the default. Status tabs
          (New / Confirmed / etc.) ignore this row so dense work queues
          still scan all of their rows in one screen. */}
      {!todayOnly && filter === "all" && monthOptions.length > 2 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.4,
              fontWeight: 700,
              marginRight: 4,
            }}
          >
            Month
          </span>
          {monthOptions.map((m) => {
            const active = effectiveMonthFilter === m.key;
            return (
              <button
                key={m.key}
                onClick={() => {
                  userPickedMonth.current = true;
                  setMonthFilter(m.key);
                }}
                className="btn"
                title={
                  m.key === "all"
                    ? "Show every month at once"
                    : `Show only orders from ${m.label}`
                }
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  background: active
                    ? "var(--tint-brand-18)"
                    : "var(--bg-card)",
                  color: active ? "var(--accent-green)" : "var(--text-secondary)",
                  border: `1px solid ${
                    active
                      ? "color-mix(in srgb, var(--color-brand) 40%, transparent)"
                      : "var(--border)"
                  }`,
                  fontWeight: active ? 700 : 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {m.label}
                <span
                  style={{
                    fontSize: 10,
                    background: active ? "var(--accent-green)" : "var(--bg-hover)",
                    color: active ? "white" : "var(--text-muted)",
                    fontWeight: 700,
                    padding: "0 6px",
                    borderRadius: 999,
                    minWidth: 18,
                    textAlign: "center",
                  }}
                >
                  {m.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Bulk action bar — shows when any order is selected */}
      {selectedIds.size > 0 && (
        <div
          className="card"
          style={{
            padding: 12,
            marginBottom: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderLeft: "3px solid var(--accent-green)",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {selectedIds.size} selected
            </span>
            {bulkMsg && (
              <span
                style={{
                  fontSize: 12,
                  color: bulkMsg.includes("failed") || bulkMsg.includes("Error")
                    ? "var(--accent-red)"
                    : "var(--accent-green)",
                }}
              >
                {bulkMsg}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              className="btn btn-secondary"
              onClick={bulkPrint}
              disabled={bulkBusy}
              style={{ fontSize: 12 }}
            >
              <Printer size={13} /> Print
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowPlanRoutePicker(true)}
              disabled={bulkBusy}
              style={{ fontSize: 12 }}
              title="Plan a route for these orders"
            >
              <Map size={13} /> Plan Route
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => bulkAction("confirm")}
              disabled={bulkBusy}
              style={{ fontSize: 12 }}
            >
              <Check size={13} /> Confirm
            </button>
            <button
              className="btn btn-primary"
              onClick={() => bulkAction("delivered")}
              disabled={bulkBusy}
              style={{ fontSize: 12 }}
            >
              <Truck size={13} /> Mark Delivered
            </button>
            <button
              className="btn btn-danger"
              onClick={() => setShowBulkCancel(true)}
              disabled={bulkBusy}
              style={{ fontSize: 12 }}
            >
              <X size={13} /> Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={() => bulkAction("delete")}
              disabled={bulkBusy}
              style={{ fontSize: 12 }}
            >
              <Trash2 size={13} /> Delete
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkBusy}
              style={{ fontSize: 12 }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {selectedIds.size === 0 && filtered.length > 0 && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Check size={13} />
          Tip: check rows to enable bulk actions (confirm, mark delivered, print, cancel).
        </div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th
                  style={{
                    width: 64,
                    textAlign: "center",
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    background: "var(--bg-card)",
                  }}
                  title="Select rows for bulk actions"
                >
                  <div style={{ fontSize: 9, lineHeight: 1, marginBottom: 4, color: "var(--text-secondary)" }}>
                    SELECT
                  </div>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all orders"
                    title="Select all"
                  />
                </th>
                <th>Order No</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="hide-mobile">Items</th>
                <th className="hide-mobile">Area</th>
                <th className="hide-mobile">Cluster</th>
                <th>Total</th>
                <th className="hide-mobile">Paid</th>
                <th className="hide-mobile">Due</th>
                <th className="hide-mobile">Last Update</th>
                <th className="hide-mobile">Rider</th>
                <th>Status</th>
                <th className="hide-mobile">Source</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={15} style={{ color: "var(--text-muted)", padding: 28, textAlign: "center" }}>
                    No orders found.
                  </td>
                </tr>
              )}
              {filtered.map((o) => (
                <OrderRow
                  key={o.id}
                  o={o}
                  riders={riders}
                  selectedIds={selectedIds}
                  toggleSelect={toggleSelect}
                />
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: "var(--bg-hover)", fontWeight: 700 }}>
                  <td colSpan={6} style={{ padding: "10px 10px", color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase" }}>
                    Totals ({filtered.length} order{filtered.length !== 1 ? "s" : ""}
                    {qtySummary && (
                      <>
                        {" · "}
                        <span style={{ color: "var(--accent-green)" }}>{qtySummary}</span>
                      </>
                    )}
                    )
                  </td>
                  <td style={{ padding: "10px 10px", fontWeight: 700 }}>
                    {formatMoney(totalsAmount)}
                  </td>
                  <td style={{ padding: "10px 10px", color: "var(--accent-green)" }}>
                    {formatMoney(totalsPaid)}
                  </td>
                  <td style={{ padding: "10px 10px", color: "var(--accent-red)" }}>
                    {formatMoney(totalsDue)}
                  </td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {aggRows.length > 0 && (
        <div className="card" style={{ overflow: "hidden", marginTop: 14 }}>
          <div
            onClick={() => setShowPrep((v) => !v)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              cursor: "pointer",
              background: "var(--bg-elev, rgba(255,255,255,0.02))",
              borderBottom: showPrep ? "1px solid var(--border)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Prep list</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {aggRows.length} products ·{" "}
                {aggRows.reduce((s, r) => s + r.totalKg, 0)
                  .toFixed(2)
                  .replace(/\.?0+$/, "")}{" "}
                kg · {aggRows.reduce((s, r) => s + r.totalPcs, 0)} pcs
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "4px 10px" }}
                onClick={(e) => {
                  e.stopPropagation();
                  void downloadPrepListPDF(
                    aggRows,
                    settings?.businessName || "",
                    exportRows.length
                  );
                }}
              >
                <FileText size={12} color="var(--color-danger)" /> PDF
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "4px 10px" }}
                onClick={(e) => {
                  e.stopPropagation();
                  exportXLSX(aggRows, aggregateExportCols, {
                    filename: "prep-list",
                    title: "Prep List",
                    subtitle: exportSubtitle,
                    businessName: settings?.businessName || "",
                    tagline: settings?.tagline,
                  });
                }}
              >
                <FileSpreadsheet size={12} color="var(--color-success)" /> XLSX
              </button>
            </div>
          </div>
          {showPrep && (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Product</th>
                  <th style={{ textAlign: "right", width: 100 }}>kg</th>
                  <th style={{ textAlign: "right", width: 100 }}>pcs</th>
                  <th style={{ textAlign: "right", width: 100 }}># Orders</th>
                </tr>
              </thead>
              <tbody>
                {aggRows.map((r, i) => {
                  const displayName = (r.productNameBn || r.productName || "").trim();
                  return (
                    <tr key={i}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{displayName}</div>
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 14 }}>
                        {r.totalKg ? Number(r.totalKg).toFixed(2).replace(/\.?0+$/, "") : "-"}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 14 }}>
                        {r.totalPcs ? r.totalPcs : "-"}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>
                        {r.orderCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showForm && (
        <OrderForm
          products={products}
          customers={customers}
          settings={settings}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}
      {/* showForm is now unused — kept to avoid breaking the unused-state warning below; safe to remove in next pass */}

      <CancelOrderModal
        open={showBulkCancel}
        orderNo={`${selectedIds.size} order${selectedIds.size === 1 ? "" : "s"}`}
        onClose={() => setShowBulkCancel(false)}
        onConfirm={(reason) => {
          setShowBulkCancel(false);
          return bulkAction("cancel", reason);
        }}
      />

      {showPlanRoutePicker && (
        <div
          onClick={() => setShowPlanRoutePicker(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 440,
              padding: 20,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              color: "var(--text-primary)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
                <Map size={16} color="var(--color-brand)" /> Plan Route for {selectedIds.size} order{selectedIds.size !== 1 ? "s" : ""}
              </h3>
              <button
                onClick={() => setShowPlanRoutePicker(false)}
                aria-label="Close"
                style={{
                  background: "transparent",
                  border: 0,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: 22,
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ×
              </button>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 14px", lineHeight: 1.5 }}>
              Pick the rider to assign these orders to. The route planner will auto-optimize
              the visit order and show them on a map.
            </p>

            {/* Preview without rider option */}
            <button
              onClick={() => {
                setShowPlanRoutePicker(false);
                const date = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
                const ids = Array.from(selectedIds).join(",");
                router.push(`/logistics/preview?date=${date}&selectedIds=${ids}`);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                background: "color-mix(in srgb, var(--color-brand) 15%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-brand) 50%, transparent)",
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
                marginBottom: 14,
                width: "100%",
                color: "var(--text-primary)",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  background: "var(--color-brand)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Compass size={17} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--color-brand)" }}>Preview without rider</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  See which orders go which direction from the shop (NE/NW/SE/SW)
                </div>
              </div>
              <span style={{ fontSize: 13, color: "var(--color-brand)", fontWeight: 600, flexShrink: 0 }}>Open →</span>
            </button>

            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 700 }}>
              Or assign to a rider
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
              {riders.length === 0 ? (
                <div style={{ color: "var(--text-secondary)", fontSize: 13, padding: 12, textAlign: "center" }}>
                  No riders yet. Add them on Logistics → Riders tab.
                </div>
              ) : (
                riders.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setShowPlanRoutePicker(false);
                      const date = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
                      const ids = Array.from(selectedIds).join(",");
                      router.push(`/logistics/${r.id}?date=${date}&selectedIds=${ids}`);
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--tint-brand-18)";
                      e.currentTarget.style.borderColor = "color-mix(in srgb, var(--color-brand) 60%, transparent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.borderColor = "var(--border)";
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      background: "var(--bg-hover)",
                      border: "1px solid #2c382e",
                      borderRadius: 8,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        background: r.status === "active" ? "var(--color-brand)" : "var(--text-muted)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Bike size={17} color="#fff" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                        {r.vehicle || "—"} · {r.status}
                      </div>
                    </div>
                    <span style={{ fontSize: 13, color: "var(--color-brand)", fontWeight: 600, flexShrink: 0 }}>Open →</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Single order row in the operator table. Extracted so the flat render
 *  and the month-grouped render share exactly the same row markup. */
function OrderRow({
  o,
  riders,
  selectedIds,
  toggleSelect,
}: {
  o: Order;
  riders: Rider[];
  selectedIds: Set<number>;
  toggleSelect: (id: number) => void;
}) {
  return (
    <tr
      onClick={() => (window.location.href = `/orders/${o.id}`)}
      style={{
        cursor: "pointer",
        background: selectedIds.has(o.id) ? "color-mix(in srgb, var(--color-brand) 10%, transparent)" : undefined,
      }}
    >
      <td
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "sticky",
          left: 0,
          zIndex: 1,
          textAlign: "center",
          background: selectedIds.has(o.id)
            ? "color-mix(in srgb, var(--color-brand) 10%, transparent)"
            : "var(--bg-card)",
        }}
      >
        <input
          type="checkbox"
          checked={selectedIds.has(o.id)}
          onChange={() => toggleSelect(o.id)}
          aria-label={`Select order ${o.orderNo}`}
        />
      </td>
      <td style={{ color: "var(--accent-green)", fontWeight: 600 }}>
        <a href={`/orders/${o.id}`} style={{ color: "inherit", textDecoration: "none" }}>{o.orderNo}</a>
      </td>
      <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{o.date}</td>
      <td>
        <span style={{ fontWeight: 500 }}>{o.customerName || "—"}</span>
        {o.customerPhone && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{o.customerPhone}</div>}
      </td>
      <td className="hide-mobile" style={{ color: "var(--text-secondary)", fontSize: 12, maxWidth: 260 }}>
        {o.items.length === 0 ? (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            {o.items.map((it, i) => (
              <li key={i} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ color: "var(--accent-green)", fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 38, flexShrink: 0 }}>
                  {it.qty}{it.unit}
                </span>
                <span style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.nameBn || it.name}>
                  {it.nameBn || it.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="hide-mobile">
        {o.area || o.address ? (
          <>
            <span style={{ fontWeight: 500 }}>{o.area || "—"}</span>
            {o.address && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.address}>
                {o.address}
              </div>
            )}
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="hide-mobile">
        {o.cluster ? (
          <span
            title={`${CLUSTER_LABELS[o.cluster]}${o.subCluster ? ` · ${o.subCluster}` : ""}`}
            style={{
              display: "inline-block",
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 6,
              color: CLUSTER_COLORS[o.cluster],
              background: `${CLUSTER_COLORS[o.cluster]}22`,
              border: `1px solid ${CLUSTER_COLORS[o.cluster]}55`,
            }}
          >
            {CLUSTER_SHORT[o.cluster]}
            {o.subCluster && (
              <span style={{ fontWeight: 400, marginLeft: 4, opacity: 0.8 }}>· {o.subCluster}</span>
            )}
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
        )}
      </td>
      <td style={{ fontWeight: 600 }}>{formatMoney(o.total)}</td>
      <td className="hide-mobile" style={{ color: o.paid >= o.total ? "var(--accent-green)" : "var(--accent-amber)" }}>
        {formatMoney(o.paid)}
      </td>
      <td className="hide-mobile" style={{ fontWeight: 600, color: (o.total - o.paid) > 0 ? "var(--accent-red)" : "var(--accent-green)" }}>
        {formatMoney(o.total - o.paid)}
      </td>
      <td className="hide-mobile" style={{ color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
        {o.deliveredAt
          ? `Delivered: ${bdParts(o.deliveredAt).date}`
          : o.confirmedAt
          ? `Confirmed: ${bdParts(o.confirmedAt).date}`
          : `Created: ${bdParts(o.createdAt).date}`}
      </td>
      <td className="hide-mobile" style={{ fontSize: 13 }}>
        {o.deliveryMode === "pathao" ? (
          <span style={{ color: "var(--accent-amber)", fontWeight: 600 }}>Pathao</span>
        ) : o.riderId ? (
          <span style={{ fontWeight: 600 }}>
            {riders.find((r) => r.id === o.riderId)?.name || o.riderName || `Rider #${o.riderId}`}
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Unassigned</span>
        )}
      </td>
      <td>
        <StatusBadge status={o.status} />
      </td>
      <td className="hide-mobile">
        <span
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 20,
            background: `${SOURCE_COLORS[o.source] || SOURCE_COLORS.manual}22`,
            color: SOURCE_COLORS[o.source] || SOURCE_COLORS.manual,
            border: `1px solid ${SOURCE_COLORS[o.source] || SOURCE_COLORS.manual}55`,
            whiteSpace: "nowrap",
          }}
        >
          {SOURCE_LABELS[o.source] || o.source}
        </span>
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 11, padding: "4px 10px" }}
          onClick={(e) => {
            e.stopPropagation();
            window.open(`/orders/${o.id}?print=1`, "_blank");
          }}
          title="Open invoice in a new tab — Ctrl+P to print"
        >
          <Printer size={12} /> Print
        </button>
      </td>
    </tr>
  );
}
