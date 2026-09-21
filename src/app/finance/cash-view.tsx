"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet, TrendingUp, TrendingDown, Truck, Coins, Calendar } from "lucide-react";
import { formatMoney } from "@/lib/ui";

/**
 * Cash / P&L — read-only revenue / rider-cost / expenses / net dashboard
 * over a date range. Sticks to data the operator already trusts (orders
 * with `status='delivered'` and the `expenses` table) — no inference, no
 * accounting cleverness. Lives inside the /finance shell.
 */

interface DayRow {
  date: string;
  revenue: number;
  riderCost: number;
  expenses: number;
  net: number;
  deliveredOrders: number;
  expenseCount: number;
}

interface CategoryRow {
  category: string;
  amount: number;
  count: number;
}

interface SummaryPayload {
  ok: true;
  from: string;
  to: string;
  total: {
    revenue: number;
    riderCost: number;
    expenses: number;
    net: number;
    deliveredOrders: number;
  };
  byDay: DayRow[];
  expensesByCategory: CategoryRow[];
}

type RangePreset = "today" | "week" | "month" | "all" | "custom";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function firstOfMonthIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function rangeFor(preset: RangePreset, customFrom: string, customTo: string): { from: string; to: string } {
  const today = todayIso();
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") return { from: isoDaysAgo(6), to: today };
  if (preset === "month") return { from: firstOfMonthIso(), to: today };
  if (preset === "all") return { from: "0001-01-01", to: today };
  return { from: customFrom, to: customTo };
}

function categoryColor(c: string): string {
  const map: Record<string, string> = {
    fuel: "#f59e0b",
    salary: "#3b82f6",
    packaging: "#10b981",
    marketing: "#ec4899",
    rent: "#8b5cf6",
    utilities: "#06b6d4",
    misc: "#94a3b8",
  };
  return map[c] ?? "#94a3b8";
}

export function CashView() {
  const [preset, setPreset] = useState<RangePreset>("today");
  const [customFrom, setCustomFrom] = useState<string>(isoDaysAgo(6));
  const [customTo, setCustomTo] = useState<string>(todayIso());
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // All-time totals — show prominently at the top so the operator doesn't
  // have to set up a date range just to see "this business has delivered X".
  const [lifetime, setLifetime] = useState<{
    revenue: number;
    riderCost: number;
    expenses: number;
    net: number;
    deliveredOrders: number;
    firstDeliveredAt: string;
    lastDeliveredAt: string;
  } | null>(null);

  const { from, to } = useMemo(
    () => rangeFor(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/finance/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { cache: "no-store" }
      );
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j.error || `Failed (HTTP ${res.status}).`);
        setData(null);
        return;
      }
      setData(j);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  // Lifetime is invariant — fetch once on mount and let it sit at the top.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance/lifetime", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j.ok) return;
        setLifetime(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalExpenseAmount = data?.expensesByCategory.reduce((s, c) => s + c.amount, 0) ?? 0;

  return (
    <div style={{ padding: 16 }}>
      {/* Lifetime summary — always visible, doesn't depend on the date range.
          Operator opens Finance and sees "this business has delivered X over
          time" without having to set up a range. */}
      <div
        className="card"
        style={{
          padding: 14,
          marginBottom: 16,
          borderLeft: "3px solid var(--color-brand, var(--accent-green))",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: "var(--text-muted)",
            marginBottom: 8,
          }}
        >
          <span style={{ color: "var(--color-brand, var(--accent-green))" }}>
            <TrendingUp size={14} />
          </span>
          All-time (since {lifetime && lifetime.firstDeliveredAt ? lifetime.firstDeliveredAt.slice(0, 10) : "—"})
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          <LifetimeStat
            label="Cash collected"
            value={lifetime?.revenue ?? null}
            accent="var(--accent-green)"
          />
          <LifetimeStat
            label="Orders delivered"
            value={lifetime ? String(lifetime.deliveredOrders) : null}
            accent="var(--accent-blue)"
          />
          <LifetimeStat
            label="Rider payouts"
            value={lifetime?.riderCost ?? null}
            accent="var(--accent-amber)"
          />
          <LifetimeStat
            label="Expenses"
            value={lifetime?.expenses ?? null}
            accent="var(--text-secondary)"
          />
          <LifetimeStat
            label="Net"
            value={lifetime?.net ?? null}
            accent={
              (lifetime?.net ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)"
            }
          />
        </div>
      </div>

      {/* Range picker */}
      <div
        className="card"
        style={{
          padding: 12,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Calendar size={16} color="var(--text-muted)" />
        <div style={{ display: "flex", gap: 4 }}>
          {(["today", "week", "month", "all", "custom"] as RangePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={preset === p ? "btn btn-primary" : "btn btn-secondary"}
              style={{ fontSize: 12, padding: "5px 12px", textTransform: "capitalize" }}
            >
              {p === "today"
                ? "Today"
                : p === "week"
                ? "This Week"
                : p === "month"
                ? "This Month"
                : p === "all"
                ? "All Time"
                : "Custom"}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{ fontSize: 12, padding: "4px 8px" }}
            />
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>→</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={todayIso()}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{ fontSize: 12, padding: "4px 8px" }}
            />
          </div>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
          {from} → {to}
        </span>
      </div>

      {error && (
        <div className="card" style={{ padding: 12, marginBottom: 16, color: "var(--accent-red)" }}>
          {error}
        </div>
      )}

      {/* Hero stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <HeroStat
          icon={<TrendingUp size={18} />}
          label="Revenue"
          value={data?.total.revenue ?? null}
          accent="var(--accent-green)"
        />
        <HeroStat
          icon={<Truck size={18} />}
          label="Rider cost"
          value={data?.total.riderCost ?? null}
          accent="var(--accent-amber)"
        />
        <HeroStat
          icon={<Wallet size={18} />}
          label="Expenses"
          value={data?.total.expenses ?? null}
          accent="var(--accent-blue)"
        />
        <HeroStat
          icon={<Coins size={18} />}
          label="Net"
          value={data?.total.net ?? null}
          accent={
            (data?.total.net ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)"
          }
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        {/* Daily breakdown */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--color-border, var(--border))",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Daily breakdown
          </div>
          <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
            <table className="table" style={{ width: "100%", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", position: "sticky", top: 0, background: "var(--bg-primary)" }}>Date</th>
                  <th style={{ textAlign: "right", position: "sticky", top: 0, background: "var(--bg-primary)" }}>Revenue</th>
                  <th style={{ textAlign: "right", position: "sticky", top: 0, background: "var(--bg-primary)" }}>Rider cost</th>
                  <th style={{ textAlign: "right", position: "sticky", top: 0, background: "var(--bg-primary)" }}>Expenses</th>
                  <th style={{ textAlign: "right", position: "sticky", top: 0, background: "var(--bg-primary)" }}>Net</th>
                  <th style={{ textAlign: "right", position: "sticky", top: 0, background: "var(--bg-primary)" }}>Orders</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data && (
                  <tr>
                    <td colSpan={6} style={{ padding: 14, textAlign: "center", color: "var(--text-muted)" }}>
                      Loading…
                    </td>
                  </tr>
                )}
                {data?.byDay.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 14, textAlign: "center", color: "var(--text-muted)" }}>
                      No activity in this range.
                    </td>
                  </tr>
                )}
                {data?.byDay.map((d) => (
                  <tr key={d.date}>
                    <td style={{ whiteSpace: "nowrap" }}>{d.date}</td>
                    <td style={{ textAlign: "right", color: "var(--accent-green)" }}>
                      {formatMoney(d.revenue)}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--accent-amber)" }}>
                      {formatMoney(d.riderCost)}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--accent-blue)" }}>
                      {formatMoney(d.expenses)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        color: d.net >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                      }}
                    >
                      {formatMoney(d.net)}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--text-muted)" }}>
                      {d.deliveredOrders}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expenses by category */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--color-border, var(--border))",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Top expenses
          </div>
          {!data || data.expensesByCategory.length === 0 ? (
            <div style={{ padding: 14, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No expenses in this range.
            </div>
          ) : (
            <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {data.expensesByCategory.map((c) => {
                const pct = totalExpenseAmount === 0 ? 0 : (c.amount / totalExpenseAmount) * 100;
                return (
                  <div key={c.category}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 12,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ textTransform: "capitalize", fontWeight: 500 }}>{c.category}</span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {formatMoney(c.amount)} <span style={{ opacity: 0.6 }}>({c.count})</span>
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        background: "var(--bg-secondary)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(2, pct)}%`,
                          background: categoryColor(c.category),
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeroStat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  accent: string;
}) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "var(--text-muted)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: accent,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value == null ? "—" : formatMoney(value)}
      </div>
    </div>
  );
}

/** Lifetime-strip variant — accepts either a number (formatted as money) or
 *  a pre-stringified count like the delivered-order total. */
function LifetimeStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number | null;
  accent: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: "var(--text-muted)",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: accent,
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value == null
          ? "—"
          : typeof value === "string"
          ? value
          : formatMoney(value)}
      </div>
    </div>
  );
}
