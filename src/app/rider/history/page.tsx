"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/rider-auth";
import { riderGetJson } from "@/lib/rider-api";
import { RiderAppShell } from "@/components/rider/rider-app-shell";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";

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
  summary: { total: number; pending: number; delivered: number; failed: number; codExpected: number };
  orders: OrderSummary[];
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

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
          <DayStat label="Failed" value={data.summary.failed} accent="var(--color-danger)" />
          <DayStat label="COD" value={`৳${data.summary.codExpected.toLocaleString()}`} accent="var(--color-warning)" small />
        </div>
      )}

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
                  {o.paymentMethod === "cod" ? `৳${o.codDue.toLocaleString()} COD` : `৳${o.total.toLocaleString()}`}
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