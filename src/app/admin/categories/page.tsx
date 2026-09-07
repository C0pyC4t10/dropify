"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2, X, Edit3, Sparkles } from "lucide-react";
import type { Category, Company } from "@/lib/types";

interface AdminCompany extends Company {
  productCount: number;
}

const CATEGORY_TEMPLATES: Record<string, Array<{ slug: string; name: string; sortOrder: number }>> = {
  fashion: [
    { slug: "tops",        name: "Tops",        sortOrder: 1 },
    { slug: "bottoms",     name: "Bottoms",     sortOrder: 2 },
    { slug: "dresses",     name: "Dresses",     sortOrder: 3 },
    { slug: "outerwear",   name: "Outerwear",   sortOrder: 4 },
    { slug: "footwear",    name: "Footwear",    sortOrder: 5 },
    { slug: "bags",        name: "Bags",        sortOrder: 6 },
    { slug: "accessories", name: "Accessories", sortOrder: 7 },
    { slug: "jewelry",     name: "Jewelry",     sortOrder: 8 },
  ],
  grocery: [
    { slug: "fruits",    name: "Fruits",    sortOrder: 1 },
    { slug: "vegetables",name: "Vegetables",sortOrder: 2 },
    { slug: "dairy",     name: "Dairy",     sortOrder: 3 },
    { slug: "bakery",    name: "Bakery",    sortOrder: 4 },
    { slug: "beverages", name: "Beverages", sortOrder: 5 },
    { slug: "snacks",    name: "Snacks",    sortOrder: 6 },
    { slug: "frozen",    name: "Frozen",    sortOrder: 7 },
    { slug: "pantry",    name: "Pantry",    sortOrder: 8 },
  ],
  pharmacy: [
    { slug: "otc",       name: "OTC Medicine",       sortOrder: 1 },
    { slug: "prescription", name: "Prescription",   sortOrder: 2 },
    { slug: "wellness",  name: "Wellness",           sortOrder: 3 },
    { slug: "skincare",  name: "Skincare",           sortOrder: 4 },
    { slug: "vitamins",  name: "Vitamins & Supplements", sortOrder: 5 },
    { slug: "baby",      name: "Baby Care",          sortOrder: 6 },
  ],
  electronics: [
    { slug: "phones",     name: "Phones",         sortOrder: 1 },
    { slug: "laptops",    name: "Laptops",        sortOrder: 2 },
    { slug: "audio",      name: "Audio",          sortOrder: 3 },
    { slug: "wearables",  name: "Wearables",      sortOrder: 4 },
    { slug: "cameras",    name: "Cameras",        sortOrder: 5 },
    { slug: "accessories",name: "Accessories",    sortOrder: 6 },
  ],
};

export default function AdminCategoriesPage() {
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/overview");
      const j = (await r.json()) as { companies: AdminCompany[] };
      setCompanies(j.companies);
      if (activeCompanyId == null && j.companies[0]) {
        setActiveCompanyId(j.companies[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Switch active company + reload categories when changed.
  useEffect(() => {
    if (activeCompanyId == null) return;
    const t = setTimeout(() => {
      fetch(
        `/api/categories${includeInactive ? "?includeInactive=1" : ""}`,
        {
          headers: {
            "x-company-id": String(activeCompanyId),
          },
        }
      )
        .then((r) => r.json())
        .then((j) => setCategories(j as Category[]));
    }, 0);
    return () => clearTimeout(t);
  }, [activeCompanyId, includeInactive]);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) ?? null,
    [companies, activeCompanyId]
  );

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Home</Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <Link href="/admin" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Admin</Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <span style={{ color: "var(--text-secondary)" }}>Categories</span>
      </div>
      <Link href="/admin" className="btn btn-secondary" style={{ marginBottom: 12, display: "inline-flex" }}>
        <ArrowLeft size={14} /> Back
      </Link>

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
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Categories</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Per-tenant product taxonomy. Order them by `sortOrder`, soft-delete to keep
            historical order detail intact, or seed a template.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              style={{ width: "auto" }}
            />
            Show inactive
          </label>
          <select
            value={activeCompanyId ?? ""}
            onChange={(e) => setActiveCompanyId(Number(e.target.value))}
            style={{ minWidth: 180 }}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.productCount} products)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Seed-template banner when categories are empty */}
      {activeCompany && categories.length === 0 && (
        <SeedTemplates
          companyId={activeCompany.id}
          companySlug={activeCompany.slug}
          onDone={() => {
            // Refresh the categories list by re-running the effect
            setIncludeInactive((v) => v);
          }}
        />
      )}

      {creating && (
        <CategoryForm
          companyId={activeCompanyId!}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setIncludeInactive((v) => v);
          }}
        />
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button
          className="btn btn-primary"
          disabled={!activeCompanyId}
          onClick={() => setCreating(true)}
        >
          <Plus size={14} /> Add category
        </button>
      </div>

      {loading ? (
        <div style={{ color: "var(--text-muted)" }}>Loading…</div>
      ) : categories.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--text-muted)" }}>
          No categories yet for this company.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 60 }}>Order</th>
                <th style={{ width: 80 }}>Slug</th>
                <th>Name</th>
                <th>Description</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) =>
                editing === c.id ? (
                  <tr key={c.id}>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <CategoryForm
                        companyId={c.companyId}
                        category={c}
                        onClose={() => setEditing(null)}
                        onSaved={() => {
                          setEditing(null);
                          setIncludeInactive((v) => v);
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id}>
                    <td style={{ color: "var(--text-muted)" }}>{c.sortOrder}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{c.slug}</td>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {c.description || "—"}
                    </td>
                    <td>
                      {c.isActive ? (
                        <span style={{ color: "var(--accent-green)" }}>● Active</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>○ Inactive</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setEditing(c.id)}
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

function SeedTemplates({
  companyId,
  companySlug,
  onDone,
}: {
  companyId: number;
  companySlug: string;
  onDone: () => void;
}) {
  const suggestions = useMemo(() => {
    if (companySlug === "meat") return ["fashion", "grocery"]; // meat already has 5
    if (CATEGORY_TEMPLATES[companySlug]) return [companySlug];
    return ["fashion", "grocery", "electronics"];
  }, [companySlug]);
  const [applying, setApplying] = useState(false);
  const apply = async (templateSlug: string) => {
    const template = CATEGORY_TEMPLATES[templateSlug];
    if (!template) return;
    setApplying(true);
    try {
      for (const cat of template) {
        await fetch("/api/categories", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": String(companyId),
          },
          body: JSON.stringify(cat),
        });
      }
      onDone();
    } finally {
      setApplying(false);
    }
  };
  return (
    <div
      className="card"
      style={{
        padding: 16,
        marginBottom: 16,
        background: "rgba(77, 158, 71, 0.06)",
        borderColor: "rgba(77, 158, 71, 0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Sparkles size={16} color="var(--accent-green)" />
        <span style={{ fontWeight: 600, fontSize: 13 }}>No categories yet</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
        Start with a curated template for your vertical — you can rename or
        delete any of these afterwards.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {suggestions.map((slug) => (
          <button
            key={slug}
            className="btn btn-secondary"
            disabled={applying}
            onClick={() => apply(slug)}
            style={{ fontSize: 12 }}
          >
            <Sparkles size={13} /> Seed from “{slug}” template ({CATEGORY_TEMPLATES[slug]?.length} categories)
          </button>
        ))}
      </div>
    </div>
  );
}

function CategoryForm({
  companyId,
  category,
  onClose,
  onSaved,
}: {
  companyId: number;
  category?: Category;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !category;
  const [form, setForm] = useState({
    slug: category?.slug ?? "",
    name: category?.name ?? "",
    description: category?.description ?? "",
    sortOrder: category?.sortOrder ?? 100,
    isActive: category?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm({ ...form, [k]: v });

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      let res: Response;
      if (isNew) {
        res = await fetch("/api/categories", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": String(companyId),
          },
          body: JSON.stringify(form),
        });
      } else {
        res = await fetch(`/api/categories/${category!.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": String(companyId),
          },
          body: JSON.stringify({
            name: form.name,
            description: form.description,
            sortOrder: form.sortOrder,
            isActive: form.isActive,
          }),
        });
      }
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!category) return;
    if (
      !confirm(
        `Delete category "${category.name}"?\n\nAny products in this category will be auto-migrated to the next active category in the company. This cannot be undone.`
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: "DELETE",
        headers: { "x-company-id": String(companyId) },
      });
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div>
          <label>Slug {isNew && "(URL-safe, immutable)"}</label>
          <input
            value={form.slug}
            disabled={!isNew}
            onChange={(e) => set("slug", e.target.value.toLowerCase().trim())}
            placeholder="e.g. shirts"
            style={{ fontFamily: "monospace" }}
          />
        </div>
        <div>
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Shirts"
          />
        </div>
        <div>
          <label>Sort order</label>
          <input
            type="number"
            value={form.sortOrder}
            onChange={(e) => set("sortOrder", Number(e.target.value) || 0)}
          />
        </div>
        <div style={{ gridColumn: "span 3" }}>
          <label>Description (optional)</label>
          <input
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="e.g. Casual and formal shirts for men and women"
          />
        </div>
        <div style={{ gridColumn: "span 3", display: "flex", alignItems: "center", gap: 8 }}>
          <input
            id="cat-active"
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            style={{ width: "auto" }}
          />
          <label htmlFor="cat-active" style={{ marginBottom: 0 }}>
            Active (operators see this in dropdowns and filters)
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

      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          <Save size={13} /> {saving ? "Saving…" : isNew ? "Create" : "Save"}
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
            disabled={deleting}
          >
            <Trash2 size={13} /> {deleting ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}
