"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  ShoppingCart,
  Users,
  Package,
  Truck,
  Wallet,
  Tag,
  Ruler,
  TrendingUp,
  Activity,
  Plus,
  BookOpen,
} from "lucide-react";

interface CompanyRow {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  logoUrl: string;
  accentColor: string;
  isActive: number;
  createdAt: string;
  products: number;
  orders: number;
  delivered: number;
  revenue: number;
  expenses: number;
  suppliers: number;
  purchaseOrders: number;
  categories: number;
  units: number;
  businessName: string | null;
}

interface OverviewResponse {
  totals: {
    companies: number;
    products: number;
    orders: number;
    delivered: number;
    revenue: number;
    expenses: number;
    customers: number;
    riders: number;
    suppliers: number;
    categories: number;
    units: number;
  };
  companies: CompanyRow[];
}

const formatMoney = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;

export default function AdminConsolePage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/admin/overview")
        .then((r) => r.json())
        .then((j) => setData(j))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return <div style={{ color: "var(--text-muted)" }}>Loading console…</div>;
  }
  if (!data) {
    return <div style={{ color: "var(--accent-red)" }}>Failed to load console.</div>;
  }

  const t = data.totals;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
              Home
            </Link>
            <span style={{ margin: "0 6px" }}>/</span>
            <span style={{ color: "var(--text-secondary)" }}>Admin Console</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Dropify Console</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Cross-company view. Manage every tenant from one place.
          </p>
        </div>
        <Link href="/" className="btn btn-secondary">
          <ArrowLeft size={15} /> Back
        </Link>
        <Link
          href="/admin/companies"
          className="btn btn-primary"
          style={{ marginLeft: 8 }}
        >
          <Plus size={15} /> Add business
        </Link>
      </div>

      {/* Quick nav tiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <NavTile href="/admin/companies" icon={<Building2 size={18} />} label="Companies" count={t.companies} />
        <NavTile href="/admin/categories" icon={<Tag size={18} />} label="Categories" count={t.categories} />
        <NavTile href="/admin/units" icon={<Ruler size={18} />} label="Units" count={t.units} />
        <NavTile href="/admin/riders" icon={<Truck size={18} />} label="Rider management" count={t.riders} hideCount />
        <NavTile href="/admin/dispatch" icon={<Activity size={18} />} label="Dispatch (today)" count={t.delivered} hideCount />
        <NavTile href="/admin/cod" icon={<Wallet size={18} />} label="COD reconciliation" count={0} hideCount />
        <NavTile
          href="/admin/design-system"
          icon={<BookOpen size={18} />}
          label="Design system"
          count={0}
          hideCount
        />
      </div>

      {/* System stats */}
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0 12px" }}>
        <Activity size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        System totals
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Stat icon={<Building2 size={16} />} label="Active companies" value={t.companies} />
        <Stat icon={<Package size={16} />} label="Products (all)" value={t.products} />
        <Stat icon={<ShoppingCart size={16} />} label="Orders (all)" value={t.orders} />
        <Stat icon={<TrendingUp size={16} />} label="Delivered" value={t.delivered} />
        <Stat icon={<TrendingUp size={16} />} label="Revenue" value={formatMoney(t.revenue)} />
        <Stat icon={<Wallet size={16} />} label="Expenses" value={t.expenses} />
        <Stat icon={<Users size={16} />} label="Customers (shared)" value={t.customers} />
        <Stat icon={<Truck size={16} />} label="Riders (shared)" value={t.riders} />
      </div>

      {/* Per-company breakdown */}
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0 12px" }}>
        <Building2 size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Per-company breakdown
      </h2>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Company</th>
              <th style={{ textAlign: "right" }}>Products</th>
              <th style={{ textAlign: "right" }}>Orders</th>
              <th style={{ textAlign: "right" }}>Delivered</th>
              <th style={{ textAlign: "right" }}>Revenue</th>
              <th style={{ textAlign: "right" }}>Suppliers</th>
              <th style={{ textAlign: "right" }}>POs</th>
              <th style={{ textAlign: "right" }}>Cats</th>
              <th style={{ textAlign: "right" }}>Units</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.companies.map((c) => (
              <tr key={c.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      title={
                        c.accentColor
                          ? `${c.name} accent: ${c.accentColor}`
                          : `${c.name} (no accent set \u2014 uses Dropify Green default)`
                      }
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        flexShrink: 0,
                        background:
                          c.accentColor && /^#?[0-9a-fA-F]{3,8}$/.test(c.accentColor)
                            ? c.accentColor.startsWith("#")
                              ? c.accentColor
                              : `#${c.accentColor}`
                            : "var(--bg-elevated, #2a2a2a)",
                        border: "1px solid var(--border)",
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {c.slug}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ textAlign: "right" }}>{c.products}</td>
                <td style={{ textAlign: "right" }}>{c.orders}</td>
                <td style={{ textAlign: "right" }}>{c.delivered}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(c.revenue)}</td>
                <td style={{ textAlign: "right" }}>{c.suppliers}</td>
                <td style={{ textAlign: "right" }}>{c.purchaseOrders}</td>
                <td style={{ textAlign: "right" }}>{c.categories}</td>
                <td style={{ textAlign: "right" }}>{c.units}</td>
                <td>
                  <Link
                    href={`/admin/companies/${c.id}`}
                    style={{ fontSize: 11, color: "var(--accent-green)" }}
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NavTile({
  href,
  icon,
  label,
  count,
  hideCount,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  hideCount?: boolean;
}) {
  return (
    <Link
      href={href}
      className="card"
      style={{
        padding: 14,
        textDecoration: "none",
        color: "var(--text-primary)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        transition: "background 0.15s",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "var(--tint-brand-18)",
          color: "var(--color-brand)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
        {!hideCount && (
          <div style={{ fontSize: 18, fontWeight: 700 }}>{count}</div>
        )}
      </div>
    </Link>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="card" style={{ padding: 12 }}>
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
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
