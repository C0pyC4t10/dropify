"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Edit3,
  ExternalLink,
  Package,
  ShoppingCart,
  Tag,
  Ruler,
  Truck,
  Users,
  Wallet,
  AlertTriangle,
  TrendingUp,
  Building2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { Settings } from "@/lib/types";

interface DetailResponse {
  company: {
    id: number;
    slug: string;
    name: string;
    tagline: string;
    logoUrl: string;
    accentColor: string;
    isActive: number;
    createdAt: string;
  };
  settings: Settings | null;
  counts: {
    products: number;
    lowStock: number;
    orders: number;
    delivered: number;
    openOrders: number;
    todayOrders: number;
    revenue: number;
    customersWithOrders: number;
    suppliers: number;
    purchaseOrders: number;
    expenses: number;
    categories: number;
    units: number;
  };
  recentOrders: Array<{
    id: number;
    orderNo: string;
    date: string;
    customerName: string;
    customerPhone: string;
    area: string;
    total: number;
    status: string;
    source: string;
    createdAt: string;
  }>;
  lowStock: Array<{
    id: number;
    sku: string;
    name: string;
    stockQty: number;
    reorderLevel: number;
  }>;
  suppliers: Array<{
    id: number;
    name: string;
    phone: string;
    poCount: number;
    poTotal: number;
  }>;
}

const formatMoney = (n: number) =>
  `\u09f3${Math.round(n).toLocaleString("en-IN")}`;

const STATUS_LABELS: Record<string, string> = {
  "pending-approval": "Pending",
  "new": "New",
  "confirmed": "Confirmed",
  "preparing": "Preparing",
  "out-for-delivery": "Shipping",
  "delivered": "Delivered",
  "cancelled": "Cancelled",
  "returned": "Returned",
};

export default function AdminCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState<number | null>(null);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let alive = true;
    params.then((p) => {
      const n = Number(p.id);
      if (!Number.isFinite(n) || n <= 0) {
        setError("Invalid id");
        setLoading(false);
        return;
      }
      setId(n);
      fetch(`/api/admin/companies/${n}/detail`)
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          if (j.error) {
            setError(j.error);
          } else {
            setData(j as DetailResponse);
          }
        })
        .catch((e) => alive && setError(String(e)))
        .finally(() => alive && setLoading(false));
    });
    return () => {
      alive = false;
    };
  }, [params]);

  const switchTo = useCallback(async () => {
    if (!id) return;
    setSwitching(true);
    try {
      const res = await fetch(`/api/admin/companies/${id}/switch`, {
        method: "POST",
      });
      if (res.ok) {
        // Reload so the active-company context picks up the new tenant.
        if (typeof window !== "undefined") window.location.reload();
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Switch failed");
      }
    } finally {
      setSwitching(false);
    }
  }, [id]);

  if (loading) {
    return <div style={{ color: "var(--text-muted)" }}>Loading tenant\u2026</div>;
  }
  if (error || !data) {
    return (
      <div>
        <Link href="/admin/companies" className="btn btn-secondary" style={{ marginBottom: 12 }}>
          <ArrowLeft size={14} /> Back
        </Link>
        <div className="card" style={{ padding: 28, color: "var(--accent-red)" }}>
          {error || "Failed to load tenant."}
        </div>
      </div>
    );
  }

  const c = data.company;
  const counts = data.counts;
  const accent = c.accentColor && /^#?[0-9a-fA-F]{3,8}$/.test(c.accentColor)
    ? c.accentColor.startsWith("#")
      ? c.accentColor
      : `#${c.accentColor}`
    : null;

  return (
    <div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          marginBottom: 4,
        }}
      >
        <Link href="/admin" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
          Admin
        </Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <Link href="/admin/companies" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
          Companies
        </Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <span style={{ color: "var(--text-secondary)" }}>{c.name}</span>
      </div>
      <Link
        href="/admin/companies"
        className="btn btn-secondary"
        style={{ marginBottom: 12, display: "inline-flex" }}
      >
        <ArrowLeft size={14} /> Back
      </Link>

      {/* Header card */}
      <div
        className="card"
        style={{
          padding: 20,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            background: accent ?? "var(--bg-elevated, #2a2a2a)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 24,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {c.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{c.name}</h1>
            {c.isActive ? (
              <span style={{ color: "var(--accent-green)", fontSize: 12 }}>
                <CheckCircle2 size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                Active
              </span>
            ) : (
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                <XCircle size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                Inactive
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            {c.tagline || <em>(no tagline set)</em>}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontFamily: "monospace",
              marginTop: 4,
            }}
          >
            slug: {c.slug} \u00b7 created{" "}
            {new Date(c.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn btn-primary"
            onClick={switchTo}
            disabled={switching}
          >
            <ExternalLink size={14} />
            {switching ? " Switching\u2026" : " Switch to operate"}
          </button>
          <Link
            href={`/admin/companies`}
            className="btn btn-secondary"
            onClick={(e) => {
              e.preventDefault();
              // Inline-edit row by re-using the Companies list page.
              window.location.href = "/admin/companies";
            }}
          >
            <Edit3 size={14} /> Edit branding
          </Link>
        </div>
      </div>

      {/* Counts grid */}
      <h2 style={{ fontSize: 13, fontWeight: 600, margin: "8px 0 10px" }}>
        Activity
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <Stat icon={<Package size={14} />} label="Products" value={counts.products} sub={counts.lowStock > 0 ? `${counts.lowStock} low` : ""} subColor="var(--accent-red)" />
        <Stat icon={<Tag size={14} />} label="Categories" value={counts.categories} />
        <Stat icon={<Ruler size={14} />} label="Units" value={counts.units} />
        <Stat icon={<Truck size={14} />} label="Suppliers" value={counts.suppliers} sub={`${counts.purchaseOrders} POs`} />
        <Stat icon={<ShoppingCart size={14} />} label="Orders" value={counts.orders} sub={`${counts.todayOrders} today`} />
        <Stat icon={<TrendingUp size={14} />} label="Delivered" value={counts.delivered} />
        <Stat icon={<TrendingUp size={14} />} label="Revenue" value={formatMoney(counts.revenue)} />
        <Stat icon={<Wallet size={14} />} label="Expenses" value={counts.expenses} />
        <Stat icon={<Users size={14} />} label="Customers w/ orders" value={counts.customersWithOrders} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              fontWeight: 600,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              <ShoppingCart size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              Recent orders
            </span>
            <Link
              href="/orders"
              style={{ fontSize: 11, color: "var(--accent-green)" }}
            >
              See all in /orders \u2192
            </Link>
          </div>
          {data.recentOrders.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              No orders yet for this tenant.
            </div>
          ) : (
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Customer</th>
                  <th>Area</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th>Status</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {o.orderNo}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{o.customerName || "\u2014"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {o.customerPhone}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{o.area || "\u2014"}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                      {formatMoney(o.total)}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 6px",
                          borderRadius: 999,
                          background:
                            o.status === "delivered"
                              ? "var(--tint-brand-18)"
                              : o.status === "cancelled"
                              ? "var(--tint-danger-18)"
                              : "var(--tint-warning-18)",
                          color:
                            o.status === "delivered"
                              ? "var(--accent-green)"
                              : o.status === "cancelled"
                              ? "var(--accent-red)"
                              : "var(--accent-amber)",
                        }}
                      >
                        {STATUS_LABELS[o.status] ?? o.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {o.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={13} color="var(--accent-amber)" /> Low stock
            </h3>
            {data.lowStock.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                All products above reorder level.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.lowStock.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 12,
                      padding: "4px 0",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </span>
                    <span style={{ color: "var(--accent-red)", fontFamily: "monospace", fontSize: 11 }}>
                      {p.stockQty}/{p.reorderLevel}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
              <Truck size={13} /> Top suppliers
            </h3>
            {data.suppliers.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                No suppliers yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.suppliers.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 12,
                    }}
                  >
                    <span>{s.name}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)" }}>
                      {s.poCount} POs \u00b7 {formatMoney(s.poTotal)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
              <Building2 size={13} /> Settings
            </h3>
            {data.settings ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <Row label="Business name" value={data.settings.businessName} />
                <Row label="Phone" value={data.settings.phone} />
                <Row label="Address" value={data.settings.address} />
                <Row
                  label="Free delivery threshold"
                  value={`\u09f3${data.settings.freeDeliveryThreshold ?? 0}`}
                />
                <Row
                  label="Delivery charge"
                  value={`\u09f3${data.settings.deliveryCharge ?? 0}`}
                />
                <Row
                  label="WP integration"
                  value={data.settings.wpOutboundEnabled ? "On" : "Off"}
                />
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                No settings yet.
              </div>
            )}
            <Link
              href="/settings"
              style={{
                fontSize: 11,
                color: "var(--accent-green)",
                marginTop: 8,
                display: "inline-block",
              }}
            >
              Open /settings (per-tenant) \u2192
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  subColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div className="card" style={{ padding: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "var(--text-muted)",
          fontSize: 11,
          marginBottom: 4,
        }}
      >
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 10, color: subColor ?? "var(--text-muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: "right" }}>{value || "\u2014"}</span>
    </div>
  );
}
