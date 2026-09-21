"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Banknote,
  Bike,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Package,
  Bell,
  Wallet,
  TrendingUp,
} from "lucide-react";
import type { DashboardStats } from "@/lib/db";
import { formatMoney, bdParts } from "@/lib/ui";
import { StatusBadge } from "@/components/status-badge";

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [now, setNow] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      setStats(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, [load]);

  if (!stats) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Loading...</div>;
  }

  const cards: Array<{ label: string; value: React.ReactNode; icon: typeof ClipboardList; color: string; href?: string }> = [
    { label: "Today's Orders", value: String(stats.today.orders), icon: ClipboardList, color: "var(--accent-blue)", href: "/orders" },
    { label: "Today's Revenue", value: formatMoney(stats.today.revenue), icon: Banknote, color: "var(--accent-green)", href: "/finance?tab=cash" },
    { label: "Today's Expenses", value: formatMoney(stats.today.expenses), icon: Wallet, color: "var(--accent-amber)", href: "/finance" },
    {
      label: "Today's Net",
      value: formatMoney(stats.today.net),
      icon: TrendingUp,
      color: stats.today.net >= 0 ? "var(--accent-green)" : "var(--accent-red)",
      href: "/finance?tab=cash",
    },
    { label: "Delivered Today", value: String(stats.today.delivered), icon: CheckCircle2, color: "var(--accent-green)" },
    { label: "Pending Today", value: String(stats.today.pending), icon: Clock, color: "var(--accent-amber)" },
    {
      label: "New Orders",
      value: String(stats.newOrders.length),
      icon: Bell,
      color: stats.newOrders.length > 0 ? "var(--accent-red)" : "var(--accent-green)",
    },
    { label: "Active Riders", value: String(stats.activeRiders.length), icon: Bike, color: "var(--accent-blue)" },
    { label: "Month Revenue", value: formatMoney(stats.monthlyRevenue), icon: Banknote, color: "var(--accent-green)", href: "/finance?tab=cash" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          Dashboard
          <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 400, marginLeft: 10 }}>
            {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </span>
        </h1>
        <Link href="/orders" className="btn btn-primary">
          <ClipboardList size={15} /> New Order
        </Link>
      </div>

      <div
        className="stats-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {cards.map((c) => {
          const inner = (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{c.label}</span>
                <c.icon size={18} color={c.color} />
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{c.value}</div>
            </>
          );
          if (c.href) {
            return (
              <Link key={c.label} href={c.href} className="stat-card" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                {inner}
              </Link>
            );
          }
          return (
            <div key={c.label} className="stat-card">
              {inner}
            </div>
          );
        })}
      </div>

      <div
        className="card"
        style={{
          marginBottom: 16,
          borderLeft: stats.newOrders.length > 0 ? "4px solid var(--accent-red)" : undefined,
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Bell
              size={16}
              color={stats.newOrders.length > 0 ? "var(--accent-red)" : "var(--text-muted)"}
            />
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>New Orders</h2>
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                padding: "2px 12px",
                borderRadius: 20,
                background:
                  stats.newOrders.length > 0
                    ? "color-mix(in srgb, var(--color-danger) 18%, transparent)"
                    : "rgba(96,160,96,0.18)",
                color:
                  stats.newOrders.length > 0
                    ? "var(--accent-red)"
                    : "var(--accent-green)",
                border:
                  stats.newOrders.length > 0
                    ? "1px solid color-mix(in srgb, var(--color-danger) 40%, transparent)"
                    : "1px solid rgba(96,160,96,0.4)",
                minWidth: 36,
                textAlign: "center",
              }}
            >
              {stats.newOrders.length}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              awaiting confirmation
            </span>
          </div>
          <Link
            href="/orders?status=new"
            style={{ fontSize: 12, color: "var(--accent-green)", textDecoration: "none" }}
          >
            View all →
          </Link>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Created</th>
                <th>Customer</th>
                <th>Address</th>
                <th>Quantity</th>
                <th>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stats.newOrders.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ color: "var(--text-muted)", padding: 20, textAlign: "center" }}
                  >
                    No new orders — everything is confirmed.
                  </td>
                </tr>
              )}
              {stats.newOrders.slice(0, 10).map((o) => {
                const qty = o.items
                  .map((it) => `${it.qty}${it.unit === "kg" ? "kg" : "pc"}`)
                  .join(", ");
                const address = [o.area, o.address].filter(Boolean).join(" — ");
                const created = bdParts(o.createdAt);
                return (
                  <tr key={o.id}>
                    <td>
                      <Link
                        href={`/orders/${o.id}`}
                        style={{
                          color: "var(--accent-green)",
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        {o.orderNo}
                      </Link>
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
                      {created.date}{" "}
                      <span style={{ color: "var(--text-muted)" }}>{created.time}</span>
                    </td>
                    <td>
                      <div>{o.customerName || "—"}</div>
                      {o.customerPhone && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {o.customerPhone}
                        </div>
                      )}
                    </td>
                    <td className="hide-mobile" style={{ color: "var(--text-secondary)", fontSize: 12, maxWidth: 220 }}>
                      {address || "—"}
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
                      {qty}
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(o.total)}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/orders/${o.id}`}
                        className="btn btn-primary"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                      >
                        Confirm
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dashboard-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div className="card">
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Active Orders</h2>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 20,
                  background: "var(--tint-warning-18)",
                  color: "var(--accent-amber)",
                  border: "1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)",
                  fontWeight: 600,
                }}
              >
                {stats.openOrders.length}
              </span>
            </div>
            <Link href="/orders" style={{ fontSize: 12, color: "var(--accent-green)", textDecoration: "none" }}>View all →</Link>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
<thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Total</th>
                <th className="hide-mobile">Rider</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stats.openOrders.length === 0 && (
                <tr><td colSpan={6} style={{ color: "var(--text-muted)", padding: 20, textAlign: "center" }}>No active orders</td></tr>
              )}
              {stats.openOrders.map((o) => {
                const isOld = o.date !== new Date().toISOString().slice(0, 10);
                return (
                <tr key={o.id} style={{ background: isOld ? "color-mix(in srgb, var(--color-warning) 6%, transparent)" : undefined }}>
                  <td>
                    <Link href={`/orders/${o.id}`} style={{ color: "var(--accent-green)", textDecoration: "none", fontWeight: 600 }}>
                      {o.orderNo}
                    </Link>
                  </td>
                  <td style={{ color: isOld ? "var(--accent-amber)" : "var(--text-secondary)", fontWeight: isOld ? 600 : 400, fontSize: 12, whiteSpace: "nowrap" }}>
                    {o.date}
                    {isOld && <span style={{ fontSize: 10, marginLeft: 4 }}>(overdue)</span>}
                  </td>
                  <td>{o.customerName || "—"}</td>
                  <td style={{ fontWeight: 600 }}>{formatMoney(o.total)}</td>
                  <td className="hide-mobile" style={{ color: "var(--text-secondary)" }}>
                    {o.deliveryMode === "pathao" ? (
                      <span style={{ color: "var(--accent-amber)", fontWeight: 600 }}>
                        Pathao{o.pathaoTrackingId ? ` · ${o.pathaoTrackingId}` : ""}
                      </span>
                    ) : o.riderId ? (
                      stats.activeRiders.find((r) => r.id === o.riderId)?.name || o.riderName || "?"
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>Unassigned</span>
                    )}
                  </td>
                  <td><StatusBadge status={o.status} /></td>
                </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={16} color="var(--accent-amber)" />
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Low Stock Alerts</h2>
            </div>
            <div style={{ padding: 12 }}>
              {stats.lowStock.length === 0 && (
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", padding: 8 }}>All stock levels are healthy.</p>
              )}
              {stats.lowStock.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 4px", borderBottom: "1px solid rgba(44,56,46,0.4)", fontSize: 13 }}>
                  <span>{p.name} <span style={{ color: "var(--text-muted)", fontSize: 12 }}>({p.nameBn})</span></span>
                  <span style={{ fontWeight: 600, color: "var(--accent-red)" }}>{p.stockQty} {p.unitCode}</span>
                </div>
              ))}
            </div>
          </div>

          <Link href="/inventory" className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", textDecoration: "none" }}>
            <Package size={20} color="var(--accent-green)" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Manage Stock</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Add stock, record purchases, check expiry</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}