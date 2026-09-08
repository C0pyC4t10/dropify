"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, Phone, Trash2, ChevronRight } from "lucide-react";
import type { Customer } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/ui";
import { ExportMenu, type ExportColumn } from "@/components/export-menu";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Array<{ customerName: string; customerPhone: string; total: number; status: string }>>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, o] = await Promise.all([
        fetch("/api/customers").then((r) => r.json()),
        fetch("/api/orders").then((r) => r.json()),
      ]);
      setCustomers(c);
      setOrders(o);
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

  // Match orders to this customer by EITHER name OR phone (phone is the safer
  // anchor because customer names can drift — typos, re-spellings, paste
  // corruption, etc. — but phones are typically stable).
  const matches = (c: { name: string; phone: string }, o: { customerName: string; customerPhone: string }) => {
    if (c.phone && o.customerPhone && c.phone === o.customerPhone) return true;
    if (c.name && o.customerName && c.name === o.customerName) return true;
    return false;
  };

  const lifetimeSpend = (c: { name: string; phone: string }) =>
    orders
      .filter((o) => matches(c, o) && o.status === "delivered")
      .reduce((s, o) => s + o.total, 0);

  const orderCount = (c: { name: string; phone: string }) =>
    orders.filter((o) => matches(c, o)).length;

  const filtered = customers.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.area.toLowerCase().includes(q)
    );
  });

  const allSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((c) => c.id)));
  };
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasSelection = selectedIds.size > 0;
  const exportRows = hasSelection
    ? filtered.filter((c) => selectedIds.has(c.id))
    : filtered;
  const exportSubtitle = hasSelection
    ? `${selectedIds.size} selected of ${filtered.length}`
    : (query ? `search: "${query}"` : "all customers");

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} customer${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkBusy(true);
    setBulkMsg("");
    try {
      const res = await fetch("/api/customers/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action: "delete" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const json = await res.json();
      const failed = (json.results || []).filter((r: { ok: boolean }) => !r.ok).length;
      setBulkMsg(failed > 0 ? `Deleted with ${failed} failure(s)` : `Deleted ${json.results.length}`);
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      setBulkMsg("Error: " + String(e));
    } finally {
      setBulkBusy(false);
      setTimeout(() => setBulkMsg(""), 4000);
    }
  };

  const customerExportCols: ExportColumn<Customer>[] = [
    { header: "ID", get: (c) => c.id },
    { header: "Name", get: (c) => c.name },
    { header: "Phone", get: (c) => c.phone },
    { header: "Area", get: (c) => c.area },
    { header: "Address", get: (c) => c.address },
    { header: "Notes", get: (c) => c.notes },
    { header: "Orders", get: (c) => orderCount(c) },
    { header: "Lifetime Spend (BDT)", get: (c) => lifetimeSpend(c) },
    { header: "Added", get: (c) => (c.createdAt || "").slice(0, 10) },
  ];

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Loading...</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Customers</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <ExportMenu
            rows={exportRows}
            cols={customerExportCols}
            filename={hasSelection ? "customers-selected" : "customers"}
            title="Customers"
            subtitle={exportSubtitle}
            orientation="landscape"
            label={hasSelection ? `Export ${selectedIds.size} selected` : "Export"}
          />
          <Link href="/customers/new" className="btn btn-primary">
            <Plus size={15} /> Add Customer
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", width: 280 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--text-muted)" }} />
          <input placeholder="Search name / phone / area" value={query} onChange={(e) => setQuery(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        {hasSelection && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {selectedIds.size} selected
            </span>
            <button className="btn btn-danger" onClick={bulkDelete} disabled={bulkBusy} style={{ fontSize: 12 }}>
              <Trash2 size={13} /> Delete
            </button>
            <button className="btn btn-secondary" onClick={() => setSelectedIds(new Set())} style={{ fontSize: 12 }}>
              Clear
            </button>
            {bulkMsg && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{bulkMsg}</span>}
          </div>
        )}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    title="Select all"
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <th style={{ width: 70 }}>Customer ID</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Area</th>
                <th>Orders</th>
                <th>Lifetime Spend</th>
                <th>Added</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ color: "var(--text-muted)", padding: 28, textAlign: "center" }}>No customers found.</td></tr>
              )}
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  style={{
                    cursor: "pointer",
                    background: selectedIds.has(c.id) ? "color-mix(in srgb, var(--color-brand) 8%, transparent)" : undefined,
                  }}
                  onClick={() => (window.location.href = `/customers/${c.id}`)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    #{c.id}
                  </td>
                  <td>
                    <Link
                      href={`/customers/${c.id}`}
                      style={{ color: "var(--text-primary)", fontWeight: 500, textDecoration: "none" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.name}
                    </Link>
                    {c.notes && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.notes}</div>}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {c.phone}
                      <a href={`tel:${c.phone}`} style={{ color: "var(--accent-green)" }}><Phone size={13} /></a>
                    </span>
                  </td>
                  <td>{c.area}</td>
                  <td>{orderCount(c)}</td>
                  <td style={{ fontWeight: 600 }}>{formatMoney(lifetimeSpend(c))}</td>
                  <td style={{ color: "var(--text-muted)" }}>{formatDate(c.createdAt)}</td>
                  <td style={{ color: "var(--text-muted)", textAlign: "center" }}>
                    <ChevronRight size={14} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
