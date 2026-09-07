"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Check, X } from "lucide-react";
import type { Company } from "@/lib/types";
import { useActiveCompany } from "@/lib/active-company";

interface FormState {
  slug: string;
  name: string;
  tagline: string;
}

const EMPTY_FORM: FormState = { slug: "", name: "", tagline: "" };

export default function CompaniesPage() {
  const { activeCompanyId, setActiveCompanyId, refresh } = useActiveCompany();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetch("/api/companies").then((r) => r.json());
      setCompanies(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Defer to next tick so the synchronous load() call doesn't trip the
    // setState-in-effect lint guard. load() is async — the awaitable
    // re-render comes from setLoading(false) inside it.
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const handleCreate = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to create company");
        return;
      }
      setForm(EMPTY_FORM);
      await refresh();
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitch = async (id: number) => {
    await fetch("/api/companies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setActiveCompanyId(id);
  };

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
            <span>/</span>
            <span style={{ color: "var(--text-secondary)" }}>Companies</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Companies</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Each company owns its own products, orders, suppliers, and settings.
            Customers and riders are shared.
          </p>
        </div>
        <Link href="/" className="btn btn-secondary">
          <ArrowLeft size={15} /> Back
        </Link>
      </div>

      <div
        className="card"
        style={{
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Active companies</h2>
        {loading ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
        ) : companies.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No companies yet.</div>
        ) : (
          <table className="table" style={{ marginTop: 4 }}>
            <thead>
              <tr>
                <th style={{ width: 60 }}>ID</th>
                <th style={{ width: 160 }}>Slug</th>
                <th>Name</th>
                <th>Tagline</th>
                <th style={{ width: 120 }}>Active</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td style={{ color: "var(--text-muted)" }}>{c.id}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{c.slug}</td>
                  <td style={{ fontWeight: c.id === activeCompanyId ? 600 : 500 }}>
                    {c.name}
                    {c.id === activeCompanyId && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          color: "var(--accent-green)",
                          fontWeight: 700,
                        }}
                      >
                        CURRENT
                      </span>
                    )}
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>{c.tagline || "—"}</td>
                  <td>
                    {c.isActive ? (
                      <span style={{ color: "var(--accent-green)" }}>● Active</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>○ Inactive</span>
                    )}
                  </td>
                  <td>
                    {c.id !== activeCompanyId && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleSwitch(c.id)}
                        style={{ fontSize: 11, padding: "4px 8px" }}
                      >
                        Switch to
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>
          <Plus size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Add a new company
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
          Slug is URL-safe and immutable after creation. An empty Settings row is
          seeded automatically — fill in branding on the new company&apos;s{" "}
          <Link href="/settings" style={{ color: "var(--accent-green)" }}>
            /settings
          </Link>{" "}
          page.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr", gap: 8, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 11 }}>Slug</label>
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="e.g. fashion"
              style={{ fontFamily: "monospace" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11 }}>Display name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Bazarey Fashion"
            />
          </div>
          <div>
            <label style={{ fontSize: 11 }}>Tagline</label>
            <input
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              placeholder="e.g. Style at your doorstep"
            />
          </div>
        </div>
        {error && (
          <div
            style={{
              marginTop: 10,
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
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={submitting || !form.slug || !form.name}
          >
            {submitting ? "Creating…" : "Create company"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setForm(EMPTY_FORM);
              setError(null);
            }}
            disabled={submitting}
          >
            <X size={13} /> Clear
          </button>
        </div>
      </div>
    </div>
  );
}
