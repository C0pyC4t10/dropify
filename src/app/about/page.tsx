import Link from "next/link";
import { ArrowLeft, Package, Truck, Users, Wallet, Building2, Shield, FileText } from "lucide-react";
import { getCompanies } from "@/lib/db";

export const dynamic = "force-dynamic";

const PILLARS = [
  {
    icon: Package,
    title: "Products that fit your vertical",
    body: "Meat operators get beef / chicken / mutton. Fashion operators get tops / bottoms / outerwear. Every tenant starts with vertical-tuned defaults \u2014 then customizes.",
  },
  {
    icon: Truck,
    title: "Riders, routes, deliveries",
    body: "Cluster your riders by neighborhood, auto-assign by cluster, send an SMS the moment the order ships. Pathao and Steadfast integrations included.",
  },
  {
    icon: Users,
    title: "Customers that follow you",
    body: "Same customer can buy from your meat shop and your fashion shop. Stats, lifetime spend, and order history stay in one place.",
  },
  {
    icon: Wallet,
    title: "Suppliers and expenses",
    body: "Track what you bought, who you paid, and what\u2019s still owed. Suppliers and expenses are first-class \u2014 not bolted on.",
  },
];

const VALUES = [
  {
    title: "One tool, not a stack.",
    body: "Orders, riders, suppliers, expenses, and customers in one database. No integration tax.",
  },
  {
    title: "Speed over features.",
    body: "Every feature is faster or simpler than what it replaces. Time-to-first-order is a release-blocking metric.",
  },
  {
    title: "Configurable, not custom.",
    body: "Every vertical uses the same order / rider / inventory plumbing. A new vertical costs zero code.",
  },
  {
    title: "Operator-truthful.",
    body: "We surface low stock, overdue riders, and failed payments as loudly as revenue. The dashboard never hides bad news.",
  },
];

export default async function AboutPage() {
  const companies = getCompanies();
  const companyCount = companies.length;
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "16px 4px 48px" }}>
      <Link
        href="/"
        className="btn btn-secondary"
        style={{ marginBottom: 16, display: "inline-flex" }}
      >
        <ArrowLeft size={14} /> Back
      </Link>

      {/* Hero */}
      <div
        style={{
          background:
            "linear-gradient(135deg, var(--tint-brand-12), transparent)",
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          padding: "32px 28px",
          marginBottom: 32,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--color-brand)",
            background: "var(--tint-brand-18)",
            padding: "4px 10px",
            borderRadius: 999,
            marginBottom: 16,
          }}
        >
          <Shield size={12} />
          Dropify \u00b7 ops platform
        </div>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            margin: "0 0 12px",
            letterSpacing: "-0.5px",
            lineHeight: 1.2,
          }}
        >
          The ops layer under every delivery business.
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "var(--text-secondary)",
            maxWidth: 640,
            margin: "0 0 24px",
            lineHeight: 1.5,
          }}
        >
          Dropify is a multi-vertical delivery operations platform for small and
          medium operators in emerging markets. One configurable system runs
          your orders, riders, products, suppliers, expenses, and customers
          \u2014 without stitching four tools together.
        </p>
        <div
          style={{
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            fontSize: 13,
            color: "var(--text-muted)",
          }}
        >
          <Stat label="Companies on Dropify" value={companyCount} />
          <Stat label="Multi-vertical" value="Meat / Fashion / Grocery / Pharmacy / Electronics" />
          <Stat label="Built for" value="Single-operator dispatch floors" />
        </div>
      </div>

      {/* What it does */}
      <Section title="What Dropify does">
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
          Dropify is an ops console for any business that ships physical
          goods. The same code path runs a meat shop in Dhaka, a fashion
          shop in Chittagong, and a pharmacy in Sylhet \u2014 each with its own
          categories, units, suppliers, and pricing.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          {PILLARS.map((p) => (
            <PillarCard key={p.title} {...p} />
          ))}
        </div>
      </Section>

      {/* Values */}
      <Section title="How we work">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {VALUES.map((v) => (
            <div key={v.title} className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>{v.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                {v.body}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Doc references */}
      <Section title="Read more">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          <DocLink
            href="https://github.com/C0pyC4t10/meat-delivery-ops/blob/master/BRAND_GUIDELINE.md"
            icon={<FileText size={14} />}
            title="Strategic Brand Guideline"
            hint="The full source-of-truth document: purpose, vision, voice, color system, governance."
          />
          <DocLink
            href="/admin/design-system"
            icon={<Building2 size={14} />}
            title="Design system (live swatches)"
            hint="Every color token with live swatches and the semantic layer."
          />
        </div>
      </Section>

      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          marginTop: 32,
          textAlign: "center",
        }}
      >
        Built with the same Dropify that runs every tenant \u2014{" "}
        <Link href="/" style={{ color: "var(--color-brand)" }}>
          try the demo
        </Link>
        .
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          margin: "0 0 12px",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div style={{ color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)", marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function PillarCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
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
          flexShrink: 0,
        }}
      >
        <Icon size={16} />
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  );
}

function DocLink({
  href,
  icon,
  title,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        gap: 12,
        padding: 14,
        textDecoration: "none",
        color: "var(--text-primary)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        background: "var(--bg-card)",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "var(--tint-info-12)",
          color: "var(--color-info)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          {hint}
        </div>
      </div>
    </Link>
  );
}
