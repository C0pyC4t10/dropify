"use client";

import { ArrowLeft, BookOpen, MessageSquare } from "lucide-react";
import Link from "next/link";

interface Swatch {
  name: string;
  cssVar: string;
  hex: string;
  hint?: string;
}

const BRAND_PALETTE_DARK: Swatch[] = [
  { name: "Brand",         cssVar: "--accent-green", hex: "var(--color-brand)", hint: "primary call-to-action" },
  { name: "Success",       cssVar: "--accent-green", hex: "var(--color-brand)", hint: "delivered / paid / OK" },
  { name: "Warning",       cssVar: "--accent-amber", hex: "var(--color-warning)", hint: "pending / low-stock" },
  { name: "Danger",        cssVar: "--accent-red",   hex: "var(--color-danger)", hint: "cancelled / error" },
  { name: "Info",          cssVar: "--accent-blue",  hex: "var(--color-info)", hint: "informational" },
  { name: "Cream",         cssVar: "--accent-cream", hex: "#f4ebdd", hint: "warm chip accent" },
];

const BRAND_PALETTE_LIGHT: Swatch[] = [
  { name: "Brand",         cssVar: "--accent-green", hex: "#2d7a37" },
  { name: "Success",       cssVar: "--accent-green", hex: "#2d7a37" },
  { name: "Warning",       cssVar: "--accent-amber", hex: "#c9871f" },
  { name: "Danger",        cssVar: "--accent-red",   hex: "#cc2d22" },
  { name: "Info",          cssVar: "--accent-blue",  hex: "#1d6fe0" },
];

const SURFACE_TOKENS: Swatch[] = [
  { name: "Background",         cssVar: "--bg-primary",   hex: "var(--bg-primary)" },
  { name: "Background elevated",cssVar: "--bg-card",      hex: "var(--bg-card)" },
  { name: "Background hover",   cssVar: "--bg-hover",     hex: "var(--bg-hover)" },
  { name: "Background secondary",cssVar: "--bg-secondary", hex: "var(--bg-secondary)" },
  { name: "Border",             cssVar: "--border",       hex: "var(--border)" },
];

const TEXT_TOKENS: Swatch[] = [
  { name: "Text primary",   cssVar: "--text-primary",   hex: "var(--text-primary)" },
  { name: "Text secondary", cssVar: "--text-secondary", hex: "var(--text-secondary)" },
  { name: "Text muted",     cssVar: "--text-muted",     hex: "var(--text-muted)" },
];

export default function DesignSystemPage() {
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
        <span style={{ color: "var(--text-secondary)" }}>Design system</span>
      </div>
      <Link
        href="/admin"
        className="btn btn-secondary"
        style={{ marginBottom: 12, display: "inline-flex" }}
      >
        <ArrowLeft size={14} /> Back
      </Link>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: "var(--tint-brand-18)",
            color: "var(--color-brand)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <BookOpen size={22} />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Design system</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Every token Dropify components consume. Pick one and stick to it —
            hard-coded hex values will drift from theme + per-tenant updates.
          </p>
        </div>
      </div>

      <Section title="Brand voice (Part 2 of the guideline)">
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
          Dropify sounds like a senior dispatcher who has run the floor for ten
          years. Three voice traits, each with a do / don&apos;t / boundary case.
          Source of truth: <code style={{ fontFamily: "monospace" }}>BRAND_GUIDELINE.md</code> §2.1.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          <VoiceCard
            trait="Direct"
            do='"This won\u2019t work for you."'
            dont='"We have some concerns about whether this might be the right fit."'
            boundary="Direct without being blunt. We never weaponize directness to shame the reader."
          />
          <VoiceCard
            trait="Plain"
            do='"Stock is low."'
            dont='"Inventory levels are approaching a critical threshold requiring your immediate attention."'
            boundary="Plain without being curt. \u2018Stock is low\u2019 works. \u2018Stock bad\u2019 does not."
          />
          <VoiceCard
            trait="Confident"
            do='"The pharmacy seed ships tomorrow."'
            dont='"We\u2019re aiming to ship the pharmacy seed at some point in the hopefully near future."'
            boundary="Confident without being braggy. We state what we will do. We don\u2019t boast about what we have done."
          />
          <VoiceCard
            trait="Operator-aware"
            do='"\u09f32,000 is your break-even for the route. Only the bigger orders get a rider. That\u2019s the trade-off."'
            dont="Generic SaaS copy that pretends operators don\u2019t make tradeoffs."
            boundary="Operator-aware without being lecture-y. We don\u2019t explain their job to them."
          />
        </div>
        <div
          style={{
            marginTop: 10,
            padding: 12,
            background: "var(--bg-secondary)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 4 }}>
            TAGLINE
          </div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            The ops layer under every delivery business.
          </div>
        </div>
      </Section>

      <Section title="Semantic layer (use these)">
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
          Components read these instead of the brand palette directly. The
          per-tenant <code style={{ fontFamily: "monospace" }}>accentColor</code>{" "}
          override rewires <code style={{ fontFamily: "monospace" }}>--color-brand</code>,{" "}
          <code style={{ fontFamily: "monospace" }}>--color-success</code>, etc. — so
          the entire site flips to a tenant&apos;s brand without touching code.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          <SwatchTile name="Brand"   var="--color-brand"   hint="primary CTA / active state" />
          <SwatchTile name="Success" var="--color-success" hint="OK / paid / delivered" />
          <SwatchTile name="Warning" var="--color-warning" hint="pending / low-stock" />
          <SwatchTile name="Danger"  var="--color-danger"  hint="error / cancelled" />
          <SwatchTile name="Info"    var="--color-info"    hint="informational link" />
          <SwatchTile name="Text"    var="--color-text"    hint="primary copy" />
        </div>
      </Section>

      <Section title="Tinted backgrounds (chips / pills)">
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
          Pre-computed at 12%, 18%, and 25% alpha so status pills and chips
          render the right contrast against the theme background.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          <TintTile name="Brand 12"   var="--tint-brand-12" />
          <TintTile name="Brand 18"   var="--tint-brand-18" />
          <TintTile name="Brand 25"   var="--tint-brand-25" />
          <TintTile name="Success 12" var="--tint-success-12" />
          <TintTile name="Success 18" var="--tint-success-18" />
          <TintTile name="Success 25" var="--tint-success-25" />
          <TintTile name="Warning 12" var="--tint-warning-12" />
          <TintTile name="Warning 18" var="--tint-warning-18" />
          <TintTile name="Danger 12"  var="--tint-danger-12" />
          <TintTile name="Danger 18"  var="--tint-danger-18" />
          <TintTile name="Danger 25"  var="--tint-danger-25" />
          <TintTile name="Info 12"    var="--tint-info-12" />
        </div>
      </Section>

      <Section title="Surfaces & text">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          {SURFACE_TOKENS.map((s) => (
            <TokenTile key={s.name} swatch={s} />
          ))}
          {TEXT_TOKENS.map((s) => (
            <TokenTile key={s.name} swatch={s} />
          ))}
        </div>
      </Section>

      <Section title="Brand palette (raw)">
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
          The literal hex values that drive the theme. Dark mode on the
          left, light on the right. Most code should never touch these
          directly \u2014 read the semantic layer above instead.
        </p>
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 6px", fontWeight: 600 }}>DARK</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
            }}
          >
            {BRAND_PALETTE_DARK.map((s) => (
              <TokenTile key={s.name} swatch={s} />
            ))}
          </div>
        </div>
        <div>
          <h3 style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 6px", fontWeight: 600 }}>LIGHT</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
            }}
          >
            {BRAND_PALETTE_LIGHT.map((s) => (
              <TokenTile key={s.name} swatch={s} />
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          margin: "0 0 12px",
          color: "var(--text-secondary)",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function SwatchTile({
  name,
  var: cssVar,
  hint,
}: {
  name: string;
  var: string;
  hint?: string;
}) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: `var(${cssVar})`,
            border: "1px solid var(--border)",
            flexShrink: 0,
          }}
        />
        <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
      </div>
      <code
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          fontFamily: "monospace",
          display: "block",
        }}
      >
        var({cssVar})
      </code>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function TintTile({ name, var: cssVar }: { name: string; var: string }) {
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: `var(${cssVar})`,
        fontSize: 11,
        color: "var(--text-primary)",
        textAlign: "center",
      }}
    >
      <div style={{ fontWeight: 600 }}>{name}</div>
      <code
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          fontFamily: "monospace",
          marginTop: 2,
          display: "block",
        }}
      >
        var({cssVar})
      </code>
    </div>
  );
}

function VoiceCard({
  trait,
  do: doExample,
  dont,
  boundary,
}: {
  trait: string;
  do: string;
  dont: string;
  boundary: string;
}) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        <MessageSquare size={13} color="var(--color-brand)" />
        {trait}
      </div>
      <Row label="Do" example={doExample} color="var(--color-success)" />
      <Row label="Don't" example={dont} color="var(--color-danger)" />
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          marginTop: 8,
          paddingTop: 6,
          borderTop: "1px solid var(--border)",
        }}
      >
        <strong>Boundary:</strong> {boundary}
      </div>
    </div>
  );
}

function Row({
  label,
  example,
  color,
}: {
  label: string;
  example: string;
  color: string;
}) {
  return (
    <div style={{ marginBottom: 4, fontSize: 11 }}>
      <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{label}: </span>
      <span style={{ color, fontStyle: "italic" }}>{example}</span>
    </div>
  );
}

function TokenTile({ swatch }: { swatch: Swatch }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: `var(${swatch.cssVar})`,
            border: "1px solid var(--border)",
            flexShrink: 0,
          }}
        />
        <div style={{ fontSize: 12, fontWeight: 600 }}>{swatch.name}</div>
      </div>
      <code
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          fontFamily: "monospace",
          display: "block",
        }}
      >
        var({swatch.cssVar})
      </code>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          fontFamily: "monospace",
          marginTop: 2,
        }}
      >
        {swatch.hex}
      </div>
      {swatch.hint && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
          {swatch.hint}
        </div>
      )}
    </div>
  );
}
