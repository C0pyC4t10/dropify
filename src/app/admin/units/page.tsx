"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, X, Edit3, Trash2 } from "lucide-react";
import type { Company, Unit } from "@/lib/types";

interface AdminCompany extends Company {
  productCount: number;
}

export default function AdminUnitsPage() {
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
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

  useEffect(() => {
    if (activeCompanyId == null) return;
    const t = setTimeout(() => {
      fetch(`/api/units${includeInactive ? "?includeInactive=1" : ""}`, {
        headers: { "x-company-id": String(activeCompanyId) },
      })
        .then((r) => r.json())
        .then((j) => setUnits(j as Unit[]));
    }, 0);
    return () => clearTimeout(t);
  }, [activeCompanyId, includeInactive]);

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Home</Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <Link href="/admin" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Admin</Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <span style={{ color: "var(--text-secondary)" }}>Units</span>
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
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Units</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Per-tenant measurement units. Each company picks the units that
            fit its products (meat: kg / pcs; fashion: pcs / dozen; groceries: kg / litre / pcs).
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
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {creating && (
        <UnitForm
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
          <Plus size={14} /> Add unit
        </button>
      </div>

      {loading ? (
        <div style={{ color: "var(--text-muted)" }}>Loading…</div>
      ) : units.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--text-muted)" }}>
          No units yet for this company.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Code</th>
                <th>Name</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {units.map((u) =>
                editing === u.id ? (
                  <tr key={u.id}>
                    <td colSpan={4} style={{ padding: 0 }}>
                      <UnitForm
                        companyId={u.companyId}
                        unit={u}
                        onClose={() => setEditing(null)}
                        onSaved={() => {
                          setEditing(null);
                          setIncludeInactive((v) => v);
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={u.id}>
                    <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{u.code}</td>
                    <td>{u.name}</td>
                    <td>
                      {u.isActive ? (
                        <span style={{ color: "var(--accent-green)" }}>● Active</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>○ Inactive</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setEditing(u.id)}
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

function UnitForm({
  companyId,
  unit,
  onClose,
  onSaved,
}: {
  companyId: number;
  unit?: Unit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !unit;
  const [form, setForm] = useState({
    code: unit?.code ?? "",
    name: unit?.name ?? "",
    isActive: unit?.isActive ?? true,
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
        res = await fetch("/api/units", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": String(companyId),
          },
          body: JSON.stringify(form),
        });
      } else {
        res = await fetch(`/api/units/${unit!.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": String(companyId),
          },
          body: JSON.stringify({ name: form.name, isActive: form.isActive }),
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
    if (!unit) return;
    if (
      !confirm(
        `Delete unit "${unit.code}" (${unit.name})?\n\nProducts using this unit will be auto-migrated to the next active unit. Cannot be undone.`
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/units/${unit.id}`, {
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <div>
          <label>Code {isNew && "(URL-safe, immutable)"}</label>
          <input
            value={form.code}
            disabled={!isNew}
            onChange={(e) => set("code", e.target.value.toLowerCase().trim())}
            placeholder="e.g. dozen"
            style={{ fontFamily: "monospace" }}
          />
        </div>
        <div>
          <label>Display name</label>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Dozen"
          />
        </div>
        <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 8 }}>
          <input
            id="unit-active"
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            style={{ width: "auto" }}
          />
          <label htmlFor="unit-active" style={{ marginBottom: 0 }}>
            Active (operators can pick this on the product form)
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
