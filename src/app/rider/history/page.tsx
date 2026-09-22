"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/rider-auth";
import { riderGetJson } from "@/lib/rider-api";
import { RiderAppShell } from "@/components/rider/rider-app-shell";
import { ChevronLeft, ChevronRight, Inbox, TrendingUp, Wallet, Package, CalendarDays } from "lucide-react";

interface OrderSummary {
  id: number;
  orderNo: string;
  customerName: string;
  area: string;
  riderSeq: number | null;
  status: string;
  statusLabel: string;
  paymentMethod: string;
  total: number;
  paid: number;
  codDue: number;
  itemSummary: string;
}

interface TodayResponse {
  date: string;
  summary: {
    total: number;
    pending: number;
    delivered: number;
    failed: number;
    /** Cash the rider actually collected from COD customers today. */
    codCollected: number;
    /** Full COD face value assigned today (collected + still-pending). */
    codExpected: number;
    /** Total ticket value of orders the rider couldn't deliver
     *  (cancelled / returned). */
    failedAmount: number;
  };
  orders: OrderSummary[];
}

interface LifetimeMonth {
  month: string;
  delivered: number;
  failed: number;
  cod: number;
  payout: number;
}

interface LifetimeResponse {
  firstDelivery: string | null;
  totalDelivered: number;
  totalFailed: number;
  totalCodCollected: number;
  totalPayout: number;
  daysWorked: number;
  monthly: LifetimeMonth[];
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDays(base: string, n: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return ymd(dt);
}

function formatHuman(s: string): string {
  const today = ymd(new Date());
  const yesterday = shiftDays(today, -1);
  if (s === today) return "Today";
  if (s === yesterday) return "Yesterday";
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function RiderHistoryPage() {
  const router = useRouter();
  const { accessToken, status } = useAuth();
  const [date, setDate] = useState<string>(ymd(new Date()));
  const [data, setData] = useState<TodayResponse | null>(null);
  const [lifetime, setLifetime] = useState<LifetimeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "guest") router.replace("/rider/login");
  }, [status, router]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await riderGetJson<TodayResponse>(`/api/rider/orders/today?date=${date}`, accessToken);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [accessToken, date]);

  // Lifetime stats are independent of the picked date — load once.
  const loadLifetime = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await riderGetJson<LifetimeResponse>(`/api/rider/history/lifetime`, accessToken);
      setLifetime(res);
    } catch {
      // Non-fatal — the daily view still works without the lifetime banner.
      setLifetime(null);
    }
  }, [accessToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLifetime();
  }, [loadLifetime]);

  return (
    <RiderAppShell title={formatHuman(date)}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
        gap: 8,
      }}>
        <button
          onClick={() => setDate((d) => shiftDays(d, -1))}
          style={navBtnStyle}
          aria-label="Previous day"
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={ymd(new Date())}
          style={{
            padding: "8px 12px",
            minHeight: 44,
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            background: "var(--bg-elevated)",
            color: "var(--color-text)",
            fontSize: 14,
            fontFamily: "inherit",
          }}
          aria-label="Pick a date"
        />
        <button
          onClick={() => setDate((d) => shiftDays(d, 1))}
          disabled={date >= ymd(new Date())}
          style={{ ...navBtnStyle, opacity: date >= ymd(new Date()) ? 0.4 : 1 }}
          aria-label="Next day"
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>

      {data && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 16,
        }}>
          <DayStat label="Delivered" value={data.summary.delivered} accent="var(--color-success)" />
          <DayStat
            label={data.summary.failedAmount > 0 ? `Failed (৳${data.summary.failedAmount.toLocaleString()})` : "Failed"}
            value={data.summary.failed}
            accent="var(--color-danger)"
          />
          <DayStat label="COD collected" value={`৳${data.summary.codCollected.toLocaleString()}`} accent="var(--color-warning)" small />
        </div>
      )}

      {lifetime && <LifetimeSection stats={lifetime} />}

      {error && (
        <div role="alert" style={errorBox}>{error}</div>
      )}

      {!loading && data && data.orders.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: "48px 16px",
          color: "var(--color-text-muted)",
          background: "var(--bg-elevated)",
          borderRadius: 12,
          border: "1px dashed var(--color-border)",
        }}>
          <Inbox size={36} aria-hidden style={{ color: "var(--color-text-muted)", marginBottom: 8 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text)" }}>Nothing on this day</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Try another date or check back tomorrow.</div>
        </div>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {data?.orders.map((o) => (
          <li key={o.id}>
            <button
              onClick={() => router.push(`/rider/orders/${o.id}`)}
              style={rowStyle}
              aria-label={`View ${o.orderNo} for ${o.customerName}`}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customerName}</div>
                <HistoryStatusPill status={o.status} label={o.statusLabel} />
              </div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
                {o.area} · {o.itemSummary}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
                <span>{o.orderNo}</span>
                <span style={{ fontWeight: 700 }}>
                  {o.paymentMethod === "cod"
                    ? (o.codDue > 0
                        ? `৳${o.total.toLocaleString()} (৳${o.codDue.toLocaleString()} due)`
                        : `৳${o.total.toLocaleString()}`)
                    : `৳${o.total.toLocaleString()}`}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </RiderAppShell>
  );
}

function DayStat({ label, value, accent, small }: { label: string; value: number | string; accent: string; small?: boolean }) {
  return (
    <div style={{
      padding: 12,
      background: "var(--bg-elevated)",
      borderRadius: 10,
      border: "1px solid var(--color-border)",
      textAlign: "center",
    }}>
      <div style={{ fontSize: small ? 14 : 18, fontWeight: 700, color: accent, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>{label}</div>
    </div>
  );
}

/** Lifetime banner + per-month bar chart, sits above the daily view so
 *  the rider sees their overall numbers as soon as they open History. */
function LifetimeSection({ stats }: { stats: LifetimeResponse }) {
  const maxDelivered = Math.max(1, ...stats.monthly.map((m) => m.delivered));
  const peakMonth = stats.monthly.reduce((best, m) => (m.delivered > best.delivered ? m : best), stats.monthly[0]);

  return (
    <div style={{
      background: "var(--bg-elevated)",
      border: "1px solid var(--color-border)",
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
        fontWeight: 700,
        color: "var(--color-text-muted)",
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginBottom: 14,
      }}>
        <TrendingUp size={14} aria-hidden /> Lifetime
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 10,
        marginBottom: 14,
      }}>
        <LifetimeStat icon={<Package size={16} aria-hidden />} label="Total delivered" value={stats.totalDelivered.toLocaleString()} accent="var(--color-success)" />
        <LifetimeStat icon={<TrendingUp size={16} aria-hidden />} label="Failed" value={stats.totalFailed.toLocaleString()} accent="var(--color-danger)" />
        <LifetimeStat icon={<Wallet size={16} aria-hidden />} label="COD collected" value={`৳${stats.totalCodCollected.toLocaleString()}`} accent="var(--color-warning)" />
        <LifetimeStat icon={<Wallet size={16} aria-hidden />} label="Payout earned" value={`৳${stats.totalPayout.toLocaleString()}`} accent="var(--color-brand)" />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
        <CalendarDays size={12} aria-hidden />
        {stats.daysWorked.toLocaleString()} day{stats.daysWorked === 1 ? "" : "s"} on the road
        {stats.firstDelivery && <> · since {formatHuman(stats.firstDelivery)}</>}
      </div>

      {/* Per-month bar chart — last 12 months */}
      <div style={{
        borderTop: "1px solid var(--color-border)",
        paddingTop: 12,
      }}>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
          Last 12 months
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 4,
          alignItems: "end",
          height: 64,
        }}>
          {stats.monthly.map((m) => {
            const h = Math.max(2, Math.round((m.delivered / maxDelivered) * 56));
            const isPeak = m === peakMonth && m.delivered > 0;
            return (
              <div key={m.month} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <div
                  title={`${m.month}: ${m.delivered} delivered`}
                  style={{
                    width: "100%",
                    height: h,
                    background: isPeak ? "var(--color-brand)" : "var(--tint-brand-18)",
                    borderRadius: 3,
                    transition: "height 200ms ease",
                  }}
                />
              </div>
            );
          })}
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 4,
          marginTop: 4,
          fontSize: 9,
          color: "var(--color-text-muted)",
        }}>
          {stats.monthly.map((m) => (
            <div key={m.month} style={{ textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {m.month.slice(5)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LifetimeStat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div style={{
      padding: 12,
      background: "var(--color-bg-hover)",
      border: "1px solid var(--color-border)",
      borderRadius: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const HISTORY_STATUS_COLOR: Record<string, string> = {
  delivered: "var(--color-success)",
  cancelled: "var(--color-danger)",
  returned: "var(--color-purple)",
  "out-for-delivery": "var(--color-brand)",
  preparing: "var(--color-info)",
  confirmed: "var(--color-info)",
};

function HistoryStatusPill({ status, label }: { status: string; label: string }) {
  const bg = HISTORY_STATUS_COLOR[status] ?? "var(--color-text-muted)";
  return (
    <span style={{
      padding: "3px 10px",
      borderRadius: 999,
      background: bg,
      color: "#fff",
      fontSize: 11,
      fontWeight: 700,
      flexShrink: 0,
    }}>{label}</span>
  );
}

const navBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  borderRadius: 8,
  background: "var(--bg-elevated)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
  cursor: "pointer",
};

const rowStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  background: "var(--bg-elevated)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  padding: 12,
  cursor: "pointer",
  color: "inherit",
  font: "inherit",
  minHeight: 44,
};

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "var(--tint-danger-18)",
  color: "var(--color-danger)",
  border: "1px solid var(--tint-danger-25)",
  marginBottom: 12,
  fontSize: 14,
};