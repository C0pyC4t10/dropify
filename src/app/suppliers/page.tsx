"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Phone, Truck, Edit3 } from "lucide-react";
import type { Supplier } from "@/lib/types";
import { ExportMenu, type ExportColumn } from "@/components/export-menu";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const s = await fetch("/api/suppliers").then((r) => r.json());
      setSuppliers(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Loading...</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Suppliers</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <ExportMenu
            rows={suppliers}
            cols={[
              { header: "Name", get: (s) => s.name },
              { header: "Contact Person", get: (s) => s.contact },
              { header: "Phone", get: (s) => s.phone },
              { header: "Address", get: (s) => s.address },
              { header: "Categories", get: (s) => s.category },
              { header: "Payment Terms", get: (s) => s.paymentTerms },
              { header: "Notes", get: (s) => s.notes },
            ] as ExportColumn<Supplier>[]}
            filename="suppliers"
            title="Suppliers"
            subtitle="all suppliers"
            orientation="portrait"
            label="Export"
          />
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Add Supplier
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {suppliers.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No suppliers yet.</p>
        )}
        {suppliers.map((s) => (
          <div key={s.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 50,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(232,163,61,0.15)",
                    color: "var(--accent-amber)",
                  }}
                >
                  <Truck size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.category || "All categories"}</div>
                </div>
              </div>
              <button className="btn btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setEdit(s)}>
                <Edit3 size={12} /> Edit
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-secondary)" }}>
              <span>{s.contact}</span>
              <a href={`tel:${s.phone}`} style={{ color: "var(--accent-green)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Phone size={12} /> {s.phone}
              </a>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{s.address}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>{s.paymentTerms}</div>
          </div>
        ))}
      </div>

      {(showAdd || edit) && (
        <SupplierModal
          supplier={edit}
          onClose={() => { setShowAdd(false); setEdit(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
}

function SupplierModal({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: supplier?.name || "",
    contact: supplier?.contact || "",
    phone: supplier?.phone || "",
    address: supplier?.address || "",
    category: supplier?.category || "",
    paymentTerms: supplier?.paymentTerms || "Cash on delivery",
    notes: supplier?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!form.name.trim()) {
      setError("Supplier name is required.");
      return;
    }
    setSaving(true);
    try {
      const url = supplier ? `/api/suppliers/${supplier.id}` : "/api/suppliers";
      const method = supplier ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 16px" }}>{supplier ? "Edit Supplier" : "Add Supplier"}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label>Contact Person</label><input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
          <div><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div style={{ gridColumn: "1 / -1" }}><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><label>Categories (e.g. beef, chicken)</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div>
            <label>Payment Terms</label>
            <select value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}>
              <option>Cash on delivery</option>
              <option>7-day credit</option>
              <option>15-day credit</option>
              <option>30-day credit</option>
              <option>Advance</option>
            </select>
          </div>
        </div>
        {error && <p style={{ color: "var(--accent-red)", fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}