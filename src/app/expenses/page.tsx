"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Trash2,
  Edit3,
  Wallet,
  TrendingDown,
  CalendarDays,
  X,
} from "lucide-react";
import type {
  Expense,
  ExpenseCategory,
  ExpensePaymentMethod,
} from "@/lib/types";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORY_COLORS,
  EXPENSE_PAYMENT_METHOD_LABELS,
  formatMoney,
} from "@/lib/ui";
import { ExportMenu, type ExportColumn } from "@/components/export-menu";

type CategoryFilter = ExpenseCategory | "all";

interface Summary {
  total: number;
  count: number;
  byCategory: Array<{ category: ExpenseCategory; total: number; count: number }>;
  byDay: Array<{ date: string; total: number; count: number }>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function firstOfMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function categoryColor(c: string): string {
  return EXPENSE_CATEGORY_COLORS[c] || "var(--text-muted)";
}

export default function ExpensesPage() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<string>(firstOfMonthIso());
  const [to, setTo] = useState<string>(todayIso());
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (category !== "all") params.set("category", category);
      const [rowsRes, sumRes] = await Promise.all([
        fetch(`/api/expenses?${params.toString()}`, { cache: "no-store" }).then((r) =>
          r.json()
        ),
        fetch(`/api/expenses/summary?${params.toString()}`, {
          cache: "no-store",
        }).then((r) => r.json()),
      ]);
      setRows(Array.isArray(rowsRes) ? rowsRes : []);
      setSummary(sumRes || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [from, to, category]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-clear banner after a few seconds.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(t);
  }, [banner]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        (r.vendor || "").toLowerCase().includes(q) ||
        (r.note || "").toLowerCase().includes(q) ||
        (r.category || "").toLowerCase().includes(q) ||
        (r.paymentMethod || "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const grouped = useMemo(() => {
    // Group entries by date so the table reads like a diary.
    const map = new Map<string, Expense[]>();
    for (const r of filtered) {
      const arr = map.get(r.date) ?? [];
      arr.push(r);
      map.set(r.date, arr);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  }, [filtered]);

  const daySpan =
    from && to ? Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1) : 0;
  const dailyAvg = summary && daySpan > 0 ? summary.total / daySpan : 0;

  const setQuickRange = (kind: "today" | "7d" | "30d" | "month") => {
    if (kind === "today") {
      const t = todayIso();
      setFrom(t);
      setTo(t);
    } else if (kind === "7d") {
      setFrom(isoNDaysAgo(6));
      setTo(todayIso());
    } else if (kind === "30d") {
      setFrom(isoNDaysAgo(29));
      setTo(todayIso());
    } else {
      setFrom(firstOfMonthIso());
      setTo(todayIso());
    }
  };

  const onDelete = async (e: Expense) => {
    const ok = confirm(
      `Delete expense #${e.id} (${EXPENSE_CATEGORY_LABELS[e.category] || e.category}) — ${formatMoney(e.amount)}?\n\nThis cannot be undone.`
    );
    if (!ok) return;
    setDeleting(e.id);
    setBanner(null);
    try {
      const res = await fetch(`/api/expenses/${e.id}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setBanner({ kind: "err", text: `Delete failed: ${data?.error || res.status}` });
      } else {
        setBanner({ kind: "ok", text: "Expense deleted." });
        await load();
      }
    } catch (err) {
      setBanner({ kind: "err", text: `Error: ${String(err)}` });
    } finally {
      setDeleting(null);
    }
  };

  if (loading && !summary) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
        Loading…
      </div>
    );
  }

  return (
    <div>
      {banner && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background:
              banner.kind === "ok" ? "color-mix(in srgb, var(--color-brand) 10%, transparent)" : "var(--tint-danger-12)",
            border:
              banner.kind === "ok"
                ? "1px solid color-mix(in srgb, var(--color-brand) 35%, transparent)"
                : "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
            color: banner.kind === "ok" ? "var(--accent-green)" : "var(--accent-red)",
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {banner.text}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Daily Expenses</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <ExportMenu
            rows={filtered}
            cols={[
              { header: "Date", get: (e) => e.date },
              { header: "Category", get: (e) => EXPENSE_CATEGORY_LABELS[e.category] || e.category },
              { header: "Amount (৳)", get: (e) => e.amount, total: "sum" },
              { header: "Vendor", get: (e) => e.vendor },
              { header: "Payment", get: (e) => EXPENSE_PAYMENT_METHOD_LABELS[e.paymentMethod] || e.paymentMethod },
              { header: "Note", get: (e) => e.note },
              { header: "Created", get: (e) => (e.createdAt || "").slice(0, 16).replace("T", " ") },
            ] as ExportColumn<Expense>[]}
            filename="expenses"
            title="Daily Expenses"
            subtitle={`${from} → ${to}${category !== "all" ? ` · ${EXPENSE_CATEGORY_LABELS[category] || category}` : ""}`}
            orientation="landscape"
            label="Export"
          />
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={15} /> New Expense
          </button>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { k: "today", l: "Today" },
            { k: "7d", l: "Last 7d" },
            { k: "30d", l: "Last 30d" },
            { k: "month", l: "This Month" },
          ].map((r) => {
            const active =
              (r.k === "today" && from === to && from === todayIso()) ||
              (r.k === "7d" && from === isoNDaysAgo(6) && to === todayIso()) ||
              (r.k === "30d" && from === isoNDaysAgo(29) && to === todayIso()) ||
              (r.k === "month" && from === firstOfMonthIso() && to === todayIso());
            return (
              <button
                key={r.k}
                className="btn"
                onClick={() => setQuickRange(r.k as "today" | "7d" | "30d" | "month")}
                style={{
                  fontSize: 12,
                  background: active ? "var(--tint-brand-18)" : "var(--bg-card)",
                  color: active ? "var(--accent-green)" : "var(--text-secondary)",
                  border: `1px solid ${active ? "color-mix(in srgb, var(--color-brand) 40%, transparent)" : "var(--border)"}`,
                }}
              >
                {r.l}
              </button>
            );
          })}
          <span style={{ color: "var(--text-muted)", fontSize: 12, margin: "0 4px" }}>·</span>
          <label style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{ width: 150 }}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{ width: 150 }}
            />
          </label>
        </div>
        <div style={{ position: "relative", width: 240 }}>
          <Search
            size={14}
            style={{ position: "absolute", left: 10, top: 10, color: "var(--text-muted)" }}
          />
          <input
            placeholder="Search vendor / note"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>
      </div>

      {/* Category chips */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {(["all", ...EXPENSE_CATEGORIES] as CategoryFilter[]).map((c) => {
          const active = category === c;
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className="btn"
              style={{
                fontSize: 12,
                background: active ? "var(--tint-warning-18)" : "var(--bg-card)",
                color: active ? "var(--accent-amber)" : "var(--text-secondary)",
                border: `1px solid ${active ? "color-mix(in srgb, var(--color-warning) 40%, transparent)" : "var(--border)"}`,
              }}
            >
              {c === "all" ? "All Categories" : EXPENSE_CATEGORY_LABELS[c]}
            </button>
          );
        })}
      </div>

      {/* KPI strip */}
      <div
        className="stats-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
              Total Spent
            </span>
            <Wallet size={18} color="var(--accent-amber)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(summary?.total ?? 0)}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {summary?.count ?? 0} entries · {daySpan} day{daySpan === 1 ? "" : "s"}
          </div>
        </div>
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
              Daily Average
            </span>
            <TrendingDown size={18} color="var(--accent-red)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(Math.round(dailyAvg * 100) / 100)}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>per day in selected range</div>
        </div>
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
              Top Category
            </span>
            <CalendarDays size={18} color={categoryColor(summary?.byCategory?.[0]?.category || "")} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {summary?.byCategory?.[0]
              ? EXPENSE_CATEGORY_LABELS[summary.byCategory[0].category] || summary.byCategory[0].category
              : "—"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {summary?.byCategory?.[0]
              ? `${formatMoney(summary.byCategory[0].total)} · ${summary.byCategory[0].count} entries`
              : "No expenses yet"}
          </div>
        </div>
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
              Days With Expenses
            </span>
            <CalendarDays size={18} color="var(--accent-blue)" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{summary?.byDay?.length ?? 0}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>active expense days in range</div>
        </div>
      </div>

      {/* Grouped table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          {grouped.length === 0 ? (
            <div style={{ padding: 36, textAlign: "center", color: "var(--text-muted)" }}>
              No expenses in this range.
              <div style={{ fontSize: 12, marginTop: 6 }}>
                Try widening the date range or click <b>New Expense</b>.
              </div>
            </div>
          ) : (
            grouped.map(([date, items]) => {
              const dayTotal = items.reduce((s, e) => s + e.amount, 0);
              return (
                <div key={date} style={{ borderTop: "1px solid var(--border)" }}>
                  <div
                    style={{
                      padding: "10px 14px",
                      background: "var(--bg-secondary)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{date}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
                          weekday: "long",
                        })}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {items.length} entr{items.length === 1 ? "y" : "ies"}
                      </span>
                      <span style={{ fontWeight: 700, color: "var(--accent-amber)" }}>
                        {formatMoney(dayTotal)}
                      </span>
                    </div>
                  </div>
                  <table className="table" style={{ marginBottom: 0 }}>
                    <tbody>
                      {items.map((e) => (
                        <tr key={e.id}>
                          <td style={{ width: 160 }}>
                            <span
                              style={{
                                fontSize: 11,
                                padding: "2px 8px",
                                borderRadius: 20,
                                background: `${categoryColor(e.category)}22`,
                                color: categoryColor(e.category),
                                border: `1px solid ${categoryColor(e.category)}66`,
                                fontWeight: 600,
                              }}
                            >
                              {EXPENSE_CATEGORY_LABELS[e.category] || e.category}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 500 }}>{e.vendor || "—"}</span>
                            {e.note && (
                              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                {e.note}
                              </div>
                            )}
                          </td>
                          <td style={{ color: "var(--text-secondary)", width: 120 }}>
                            <span style={{ fontSize: 12 }}>
                              {EXPENSE_PAYMENT_METHOD_LABELS[e.paymentMethod] || e.paymentMethod}
                            </span>
                          </td>
                          <td style={{ width: 130, textAlign: "right", fontWeight: 700 }}>
                            {formatMoney(e.amount)}
                          </td>
                          <td style={{ width: 100, textAlign: "right", whiteSpace: "nowrap" }}>
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: 11, padding: "4px 8px", marginRight: 4 }}
                              onClick={() => setEditing(e)}
                            >
                              <Edit3 size={12} />
                            </button>
                            <button
                              className="btn btn-danger"
                              style={{ fontSize: 11, padding: "4px 8px" }}
                              onClick={() => onDelete(e)}
                              disabled={deleting === e.id}
                              title="Delete expense"
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showNew && (
        <ExpenseModal onClose={() => setShowNew(false)} onSaved={load} defaultDate={todayIso()} />
      )}
      {editing && (
        <ExpenseModal
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ExpenseModal({
  existing,
  onClose,
  onSaved,
  defaultDate,
}: {
  existing?: Expense;
  onClose: () => void;
  onSaved: () => void;
  defaultDate?: string;
}) {
  const isEdit = !!existing;
  const [form, setForm] = useState({
    date: existing?.date || defaultDate || todayIso(),
    category: (existing?.category || "utilities") as ExpenseCategory,
    amount: existing ? String(existing.amount) : "",
    vendor: existing?.vendor || "",
    paymentMethod: (existing?.paymentMethod || "cash") as ExpensePaymentMethod,
    note: existing?.note || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v });

  const submit = async () => {
    setError("");
    const n = parseFloat(form.amount);
    if (!Number.isFinite(n) || n < 0) {
      setError("Amount must be a non-negative number (e.g. 1500 or 125.50).");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date: form.date,
        category: form.category,
        amount: n,
        vendor: form.vendor.trim(),
        paymentMethod: form.paymentMethod,
        note: form.note.trim(),
      };
      const url = isEdit ? `/api/expenses/${existing!.id}` : "/api/expenses";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
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
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 540 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
            {isEdit ? "Edit Expense" : "New Expense"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              borderRadius: 6,
              padding: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label>Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </div>
          <div>
            <label>Category *</label>
            <select value={form.category} onChange={(e) => set("category", e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c] || c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Amount (৳) *</label>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="e.g. 1500"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label>Payment Method</label>
            <select
              value={form.paymentMethod}
              onChange={(e) => set("paymentMethod", e.target.value)}
            >
              {(["cash", "bkash", "bank", "other"] as ExpensePaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {EXPENSE_PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Vendor / Paid To</label>
            <input
              placeholder="e.g. DPDC electricity, Karwan Bazar, Rahim (rider salary)"
              value={form.vendor}
              onChange={(e) => set("vendor", e.target.value)}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Note</label>
            <textarea
              rows={3}
              placeholder="Optional context (invoice #, batch, anything to remember)"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p style={{ color: "var(--accent-red)", fontSize: 13, margin: "12px 0 0" }}>{error}</p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Save Expense"}
          </button>
        </div>
      </div>
    </div>
  );
}
