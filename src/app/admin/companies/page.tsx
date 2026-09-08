"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  X,
  Edit3,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type { Company } from "@/lib/types";
import { ColorPalette } from "@/components/color-palette";

interface AdminCompany extends Company {
  businessName?: string;
}

type VerticalKey =
  | "none"
  | "meat"
  | "fashion"
  | "grocery"
  | "pharmacy"
  | "electronics";

const VERTICAL_TEMPLATES: Array<{
  key: VerticalKey;
  label: string;
  description: string;
}> = [
  { key: "none",        label: "Start blank",  description: "Just kg / pcs units. Add categories later in /admin/categories." },
  { key: "meat",        label: "Meat",         description: "beef / chicken / mutton / offal / fish (5 entries)" },
  { key: "fashion",     label: "Fashion",      description: "tops / bottoms / dresses / outerwear / footwear / bags / accessories / jewelry" },
  { key: "grocery",     label: "Grocery",      description: "fruits / vegetables / dairy / bakery / beverages / snacks / frozen / pantry" },
  { key: "pharmacy",    label: "Pharmacy",     description: "OTC / prescription / wellness / skincare / vitamins / baby care" },
  { key: "electronics", label: "Electronics",  description: "phones / laptops / audio / wearables / cameras / accessories" },
];

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/overview");
      const j = (await r.json()) as { companies: AdminCompany[] };
      setCompanies(j.companies);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <Breadcrumb trail={[{ label: "Admin", href: "/admin" }, { label: "Companies" }]} />

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
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Companies</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Every tenant in Dropify. Add a business, edit branding, deactivate, or delete.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setCreatingNew(true);
            setEditingId(null);
          }}
        >
          <Plus size={15} /> Add business
        </button>
      </div>

      {creatingNew && (
        <CompanyForm
          onClose={() => setCreatingNew(false)}
          onSaved={() => {
            setCreatingNew(false);
            void load();
          }}
        />
      )}

      {loading ? (
        <div style={{ color: "var(--text-muted)" }}>Loading…</div>
      ) : companies.length === 0 ? (
        <div
          className="card"
          style={{
            padding: 40,
            textAlign: "center",
            background: "rgba(77, 158, 71, 0.04)",
            borderColor: "rgba(77, 158, 71, 0.2)",
          }}
        >
          <Sparkles size={28} color="var(--accent-green)" />
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "12px 0 6px" }}>
            No businesses yet
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
            Spin up your first tenant. Pick a vertical template and Dropify will seed the
            starter categories + units for you.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => setCreatingNew(true)}
          >
            <Plus size={15} /> Add your first business
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 50 }}>ID</th>
                <th style={{ width: 110 }}>Slug</th>
                <th>Name</th>
                <th>Tagline</th>
                <th style={{ width: 70 }}>Status</th>
                <th style={{ width: 100 }}>Created</th>
                <th style={{ width: 90 }} />
                <th style={{ width: 70 }} />
              </tr>
            </thead>
            <tbody>
              {companies.map((c) =>
                editingId === c.id ? (
                  <tr key={c.id}>
                    <td colSpan={8} style={{ padding: 0 }}>
                      <CompanyForm
                        company={c}
                        onClose={() => setEditingId(null)}
                        onSaved={() => {
                          setEditingId(null);
                          void load();
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id}>
                    <td style={{ color: "var(--text-muted)" }}>{c.id}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{c.slug}</td>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {c.tagline || "—"}
                    </td>
                    <td>
                      {c.isActive ? (
                        <span style={{ color: "var(--accent-green)" }}>● Active</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>○ Inactive</span>
                      )}
                    </td>
                    <td style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/admin/companies/${c.id}`}
                        className="btn btn-secondary"
                        style={{ fontSize: 11, padding: "4px 8px", textDecoration: "none" }}
                      >
                        Open <ArrowRight size={11} />
                      </Link>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditingId(c.id);
                          setCreatingNew(false);
                        }}
                        style={{ fontSize: 11, padding: "4px 8px" }}
                      >
                        <Edit3 size={13} /> Edit
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Breadcrumb({
  trail,
}: {
  trail: Array<{ label: string; href?: string }>;
}) {
  return (
    <>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
          Home
        </Link>
        {trail.map((c, i) => (
          <span key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span>/</span>
            {c.href ? (
              <Link href={c.href} style={{ color: "var(--text-muted)", textDecoration: "none" }}>
                {c.label}
              </Link>
            ) : (
              <span style={{ color: "var(--text-secondary)" }}>{c.label}</span>
            )}
          </span>
        ))}
      </div>
      <Link href="/admin" className="btn btn-secondary" style={{ marginBottom: 12, display: "inline-flex" }}>
        <ArrowLeft size={14} /> Back
      </Link>
    </>
  );
}

function CompanyForm({
  company,
  onClose,
  onSaved,
}: {
  company?: Company;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !company;
  const [form, setForm] = useState({
    slug: company?.slug ?? "",
    name: company?.name ?? "",
    tagline: company?.tagline ?? "",
    logoUrl: company?.logoUrl ?? "",
    accentColor: company?.accentColor ?? "",
    seedVertical: "none" as VerticalKey,
    isActive: company?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [switchedNow, setSwitchedNow] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm({ ...form, [k]: v });

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      let res: Response;
      if (isNew) {
        res = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } else {
        res = await fetch(`/api/companies/${company!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            tagline: form.tagline,
            logoUrl: form.logoUrl,
            accentColor: form.accentColor,
            isActive: form.isActive,
          }),
        });
      }
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");

      // Force a full reload so the runtime CSS variable update
      // (--accent-green-override set by <ActiveCompanyProvider> on the html
      // element) takes visual effect everywhere. Without this, the user
      // sees the form close but the rest of the chrome stays the old
      // color until the next navigation.
      onSaved();
      if (typeof window !== "undefined") {
        setTimeout(() => window.location.reload(), 250);
      }
      return;

      if (isNew && j?.id) {
        // Auto-switch to the freshly-created tenant so the operator lands
        // inside it on the next page load.
        await fetch("/api/companies", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: j.id }),
        });
        setSwitchedNow(true);
        setTimeout(() => {
          if (typeof window !== "undefined") window.location.href = "/admin";
        }, 700);
      } else {
        onSaved();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!company) return;
    if (
      !confirm(
        `Delete company "${company.name}" (${company.slug})?\n\nThis is permanent. All its products, orders, suppliers, expenses, settings, categories, and units will be removed. Customers and riders are shared so they're untouched.`
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/companies/${company.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Delete failed");
      } else {
        onSaved();
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ background: "var(--bg-secondary)", padding: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label>Slug {isNew && "(URL-safe, immutable)"}</label>
          <input
            value={form.slug}
            disabled={!isNew}
            onChange={(e) => set("slug", e.target.value.toLowerCase().trim())}
            placeholder="e.g. fashion"
            style={{ fontFamily: "monospace" }}
          />
        </div>
        <div>
          <label>Display name *</label>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Acme Fashion"
          />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <label>Tagline</label>
          <input
            value={form.tagline}
            onChange={(e) => set("tagline", e.target.value)}
            placeholder="e.g. Style at your doorstep"
          />
        </div>
        <div>
          <label>Logo URL</label>
          <input
            value={form.logoUrl}
            onChange={(e) => set("logoUrl", e.target.value)}
            placeholder="/logos/fashion.svg"
          />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <label>Accent color</label>
          <ColorPalette
            value={form.accentColor}
            onChange={(hex) => set("accentColor", hex)}
          />
        </div>
        {isNew && (
          <div style={{ gridColumn: "span 2" }}>
            <label>
              <Sparkles size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
              Starter categories (optional)
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 8,
              }}
            >
              {VERTICAL_TEMPLATES.map((t) => {
                const active = form.seedVertical === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => set("seedVertical", t.key)}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${active ? "var(--accent-green)" : "var(--border)"}`,
                      background: active
                        ? "rgba(77, 158, 71, 0.16)"
                        : "var(--bg-primary)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{t.label}</div>
                    <div
                      style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}
                    >
                      {t.description}
                    </div>
                  </button>
                );
              })}
            </div>
            <div
              style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}
            >
              Every new tenant starts with kg + pcs units regardless. Pick a
              template to seed matching categories at create-time.
            </div>
          </div>
        )}
        <div
          style={{
            gridColumn: "span 2",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            id="active-toggle"
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            style={{ width: "auto" }}
          />
          <label htmlFor="active-toggle" style={{ marginBottom: 0 }}>
            Active (operators can switch to it from the header)
          </label>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: "6px 10px",
            background: "rgba(226,59,46,0.12)",
            border: "1px solid rgba(226,59,46,0.3)",
            borderRadius: 6,
            color: "var(--accent-red)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}
      >
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          <Save size={13} />
          {" "}
          {saving
            ? "Saving…"
            : switchedNow
            ? "Created + switching…"
            : isNew
            ? "Create business"
            : "Save changes"}
        </button>
        <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
          <X size={13} /> Cancel
        </button>
        {!isNew && (
          <button
            className="btn"
            style={{
              marginLeft: "auto",
              background: "rgba(226,59,46,0.15)",
              color: "var(--accent-red)",
              border: "1px solid rgba(226,59,46,0.3)",
            }}
            onClick={remove}
            disabled={deleting || company?.slug === "meat"}
            title={
              company?.slug === "meat"
                ? "The default company can't be deleted — set isActive=false instead"
                : ""
            }
          >
            <Trash2 size={13} /> {deleting ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}
