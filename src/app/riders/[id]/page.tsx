"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams } from "@/types/next";
import { ArrowLeft, Bike, Banknote, TrendingUp, Printer, FileText } from "lucide-react";
import type { Rider, Order, OrderStatus } from "@/lib/types";
import { formatMoney, STATUS_LABELS } from "@/lib/ui";
import { OrderRowsTable } from "@/components/rider/order-rows-table";
import { ExportMenu, type ExportColumn } from "@/components/export-menu";

type StatusFilter = "all" | "active" | "delivered" | "cancelled";
type DateFilter = "today" | "yesterday" | "last7" | "thismonth" | "all";

const STATUS_OPTIONS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

const DATE_OPTIONS: Array<{ key: DateFilter; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "thismonth", label: "This Month" },
  { key: "all", label: "All" },
];

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

/** BD-time YYYY-MM-DD for "today" */
function bdToday(): string {
  return new Date(Date.now() + BD_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD for "yesterday" in BD time */
function bdYesterday(): string {
  return new Date(Date.now() + BD_OFFSET_MS - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** First day of current month (BD time) as YYYY-MM-DD */
function bdMonthStart(): string {
  return new Date(Date.now() + BD_OFFSET_MS).toISOString().slice(0, 8) + "01";
}

/** Convert any ISO timestamp (UTC) to its YYYY-MM-DD in BD time. */
function isoToBDDate(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  return new Date(t + BD_OFFSET_MS).toISOString().slice(0, 10);
}

function isInDateRange(iso: string, range: DateFilter): boolean {
  if (range === "all") return true;
  if (!iso) return false;
  const date = isoToBDDate(iso);
  if (!date) return false;
  if (range === "today") return date === bdToday();
  if (range === "yesterday") return date === bdYesterday();
  if (range === "last7") {
    // simple string comparison works because YYYY-MM-DD is sortable
    const sevenAgo = new Date(Date.now() + BD_OFFSET_MS - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return date >= sevenAgo && date <= bdToday();
  }
  if (range === "thismonth") return date >= bdMonthStart() && date <= bdToday();
  return true;
}

function isActiveStatus(o: { status: OrderStatus }) {
  return !["delivered", "cancelled"].includes(o.status);
}

export default function RiderDetailPage() {
  const params = useParams<{ id: string }>();
  const riderId = Number(params.id);

  const [rider, setRider] = useState<Rider | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");

  const load = useCallback(async () => {
    try {
      const [r, o] = await Promise.all([
        fetch("/api/riders").then((r) => r.json()),
        fetch("/api/orders").then((r) => r.json()),
      ]);
      const found = (r as Rider[]).find((x) => x.id === riderId) || null;
      setRider(found);
      setOrders(o as Order[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [riderId]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const ownOrders = useMemo(
    () => orders.filter((o) => o.riderId === riderId && o.deliveryMode !== "pathao"),
    [orders, riderId],
  );

  const filtered = useMemo(() => {
    let result = ownOrders;
    if (statusFilter === "active") result = result.filter(isActiveStatus);
    else if (statusFilter === "delivered") result = result.filter((o) => o.status === "delivered");
    else if (statusFilter === "cancelled") result = result.filter((o) => o.status === "cancelled");
    // Pick ONE delivery date per order, with priority:
    //   1. deliveredAt        — final state, the day it was actually delivered
    //   2. updatedAt          — only if currently assigned to THIS rider
    //                            (covers "assigned today" / "out-for-delivery
    //                            today" even when confirmedAt is older)
    //   3. confirmedAt        — the day delivery was scheduled
    //   4. createdAt          — fallback
    // This keeps today's assignments in today's view, and yesterday's
    // deliveries in yesterday's view — never mixing the two.
    return result.filter((o) => {
      const ts =
        o.deliveredAt ||
        (o.riderId === riderId ? o.updatedAt : "") ||
        o.confirmedAt ||
        o.createdAt;
      return isInDateRange(ts, dateFilter);
    });
  }, [ownOrders, statusFilter, dateFilter, riderId]);

  const delivered = ownOrders.filter((o) => o.status === "delivered");
  const pending = ownOrders.filter(isActiveStatus);
  const revenue = delivered.reduce((s, o) => s + o.total, 0);
  const payout = delivered.reduce((s, o) => s + (o.riderCost || 0), 0);

  // Build export columns
  const exportCols: ExportColumn<Order>[] = [
    { header: "Order #", get: (o) => o.orderNo },
    { header: "Confirmed", get: (o) => (o.confirmedAt || "").slice(0, 16).replace("T", " ") },
    { header: "Customer", get: (o) => o.customerName },
    { header: "Phone", get: (o) => o.customerPhone },
    { header: "Area", get: (o) => o.area },
    { header: "Address", get: (o) => o.address },
    { header: "Items", get: (o) => o.items.map((it) => `${it.qty}${it.unit === "kg" ? "kg" : "pc"} ${it.name}`).join("; ") },
    { header: "Status", get: (o) => STATUS_LABELS[o.status] || o.status },
    { header: "Total (BDT)", get: (o) => o.total },
    { header: "Paid", get: (o) => o.paid },
    { header: "Due", get: (o) => Math.max(0, o.total - o.paid) },
    { header: "Rider Cost", get: (o) => o.riderCost },
    { header: "Note", get: (o) => o.note },
  ];

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Loading...</div>;
  }

  if (!rider) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>Rider not found.</p>
        <Link href="/riders" className="btn btn-primary">
          <ArrowLeft size={14} /> Back to Riders
        </Link>
      </div>
    );
  }

  const filterSubtitle =
    `${STATUS_OPTIONS.find((s) => s.key === statusFilter)?.label} · ${DATE_OPTIONS.find((d) => d.key === dateFilter)?.label}` +
    ` · ${filtered.length} order${filtered.length !== 1 ? "s" : ""}`;

  const segmentBtn = (active: boolean, onClick: () => void, label: string) => (
    <button
      type="button"
      onClick={onClick}
      className="btn"
      style={{
        fontSize: 12,
        padding: "6px 12px",
        background: active ? "rgba(77, 158, 71, 0.18)" : "var(--bg-card)",
        color: active ? "var(--accent-green)" : "var(--text-secondary)",
        border: `1px solid ${active ? "rgba(77,158,71,0.4)" : "var(--border)"}`,
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      {/* Back link */}
      <Link
        href="/riders"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13,
          color: "var(--text-secondary)",
          textDecoration: "none",
          marginBottom: 12,
        }}
      >
        <ArrowLeft size={14} /> All Riders
      </Link>

      {/* Rider header */}
      <div className="card" style={{ padding: 20, marginBottom: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(59, 130, 246, 0.18)",
            color: "var(--accent-blue)",
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          {rider.name.slice(0, 1).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{rider.name}</h1>
            <span
              className="status-badge"
              style={{
                fontSize: 11,
                padding: "2px 10px",
                background: rider.status === "active" ? "rgba(77,158,71,0.18)" : "rgba(159,159,159,0.18)",
                color: rider.status === "active" ? "var(--accent-green)" : "var(--text-muted)",
                border: `1px solid ${rider.status === "active" ? "rgba(77,158,71,0.4)" : "var(--border)"}`,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {rider.status}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
            <Bike size={13} style={{ display: "inline-block", verticalAlign: -2, marginRight: 4 }} />
            {rider.vehicle} ·{" "}
            <a href={`tel:${rider.phone}`} style={{ color: "var(--accent-green)", textDecoration: "none" }}>
              {rider.phone}
            </a>
          </div>
        </div>
      </div>

      {/* 4 stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Total Delivered</span>
            <TrendingUp size={16} color="var(--accent-green)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{delivered.length}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>of {ownOrders.length} total</div>
        </div>
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Active Loads</span>
            <Bike size={16} color="var(--accent-amber)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: pending.length > 0 ? "var(--accent-amber)" : "var(--text-muted)" }}>
            {pending.length}
          </div>
        </div>
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Delivered Revenue</span>
            <Banknote size={16} color="var(--accent-green)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(revenue)}</div>
        </div>
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Total Payout</span>
            <Banknote size={16} color="var(--accent-red)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: payout > 0 ? "var(--accent-red)" : "var(--text-muted)" }}>
            {formatMoney(payout)}
          </div>
        </div>
      </div>

      {/* Filter + actions bar */}
      <div
        className="card"
        style={{ padding: 14, marginBottom: 12, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Status
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {STATUS_OPTIONS.map((s) => (
              <span key={s.key}>{segmentBtn(statusFilter === s.key, () => setStatusFilter(s.key), s.label)}</span>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Date Range
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {DATE_OPTIONS.map((d) => (
              <span key={d.key}>{segmentBtn(dateFilter === d.key, () => setDateFilter(d.key), d.label)}</span>
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              // Map current date filter to a manifest range so the printout
              // mirrors what's on screen.
              const today = bdToday();
              let from = today;
              let to = today;
              if (dateFilter === "today") {
                from = today;
                to = today;
              } else if (dateFilter === "yesterday") {
                from = bdYesterday();
                to = bdYesterday();
              } else if (dateFilter === "last7") {
                from = new Date(new Date(today + "T12:00:00").getTime() - 6 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .slice(0, 10);
                to = today;
              } else if (dateFilter === "thismonth") {
                from = today.slice(0, 8) + "01";
                to = today;
              } else {
                // "all" — open with no range; manifest page defaults to today
                window.open(`/riders/${riderId}/manifest?autoprint=1`, "_blank");
                return;
              }
              const params = from === to ? `date=${from}` : `from=${from}&to=${to}`;
              window.open(`/riders/${riderId}/manifest?${params}&autoprint=1`, "_blank");
            }}
            title="Open printable manifest (matches current date filter)"
          >
            <Printer size={13} /> Manifest
          </button>
          <ExportMenu
            rows={filtered}
            cols={exportCols}
            filename={`rider-${rider.name.replace(/\s+/g, "-").toLowerCase()}-${dateFilter}`}
            title={`${rider.name} — Delivery History`}
            subtitle={filterSubtitle}
            orientation="landscape"
            label="Export"
          />
        </div>
      </div>

      {/* Orders table */}
      <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
        <OrderRowsTable orders={filtered} />
      </div>

      {/* Footer summary */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 16px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        <span style={{ color: "var(--text-secondary)" }}>
          Showing <strong style={{ color: "var(--text-primary)" }}>{filtered.length}</strong> of {ownOrders.length} orders
        </span>
        <div style={{ display: "flex", gap: 18 }}>
          <span>
            <span style={{ color: "var(--text-muted)" }}>Subtotal: </span>
            <strong>{formatMoney(filtered.reduce((s, o) => s + o.total, 0))}</strong>
          </span>
          <span>
            <span style={{ color: "var(--text-muted)" }}>Paid: </span>
            <strong style={{ color: "var(--accent-green)" }}>{formatMoney(filtered.reduce((s, o) => s + o.paid, 0))}</strong>
          </span>
          <span>
            <span style={{ color: "var(--text-muted)" }}>Due: </span>
            <strong style={{ color: "var(--accent-red)" }}>{formatMoney(filtered.reduce((s, o) => s + Math.max(0, o.total - o.paid), 0))}</strong>
          </span>
          <span>
            <span style={{ color: "var(--text-muted)" }}>Payout: </span>
            <strong>{formatMoney(filtered.reduce((s, o) => s + (o.riderCost || 0), 0))}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
