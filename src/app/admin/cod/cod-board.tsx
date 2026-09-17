"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";

interface CodRow {
  riderId: number;
  riderName: string;
  totalDeliveredCodOrders: number;
  expectedAmount: number;
  collectedAmount: number;
  discrepancy: number;
  mismatchedOrders: number;
}

interface OverrideRow {
  orderId: number;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  area: string;
  total: number;
  overrideActor: string;
  deliveredAt: string;
  podIncomplete: boolean;
}

interface CodPayload {
  date: string;
  companyId: number;
  totals: {
    expected: number;
    collected: number;
    discrepancy: number;
    mismatchedOrders: number;
    totalDeliveredCodOrders: number;
  };
  rows: CodRow[];
  overrides: OverrideRow[];
}

const POLL_MS = 30_000;

export function CodBoard({ initial }: { initial: CodPayload }) {
  const [data, setData] = useState<CodPayload>(initial);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/cod?date=${initial.date}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.ok) {
          setData(json);
          setLastUpdated(Date.now());
        }
      }
    } catch {}
  }, [initial.date]);

  useEffect(() => {
    const handle = setInterval(refresh, POLL_MS);
    return () => clearInterval(handle);
  }, [refresh]);

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Link href="/admin" className="btn btn-secondary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 8, fontSize: 12 }}>
            <ArrowLeft size={13} /> Back to admin
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>COD reconciliation</h1>
          <div style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 4 }}>
            {data.date} · tenant #{data.companyId} ·{" "}
            {lastUpdated ? `updated ${formatTime(lastUpdated)}` : "loading"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/dispatch" className="btn btn-secondary" style={{ textDecoration: "none" }}>
            ← Dispatch board
          </Link>
          <button onClick={refresh} className="btn btn-secondary">Refresh now</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
        <Tile label="Expected" value={`৳${data.totals.expected.toLocaleString()}`} />
        <Tile
          label="Collected"
          value={`৳${data.totals.collected.toLocaleString()}`}
          accent="var(--color-success)"
        />
        <Tile
          label="Discrepancy"
          value={`৳${data.totals.discrepancy.toLocaleString()}`}
          accent={
            Math.abs(data.totals.discrepancy) > 1
              ? "var(--color-danger)"
              : "var(--color-text-secondary)"
          }
        />
        <Tile
          label="Mismatch orders"
          value={data.totals.mismatchedOrders}
          accent={
            data.totals.mismatchedOrders > 0 ? "var(--color-warning)" : "var(--color-success)"
          }
        />
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 12 }}>Per rider</h2>
        {data.rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)" }}>
            No COD orders delivered today.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>Rider</th>
                <th style={{ ...th, textAlign: "right" }}>COD orders</th>
                <th style={{ ...th, textAlign: "right" }}>Expected</th>
                <th style={{ ...th, textAlign: "right" }}>Collected</th>
                <th style={{ ...th, textAlign: "right" }}>Discrepancy</th>
                <th style={{ ...th, textAlign: "right" }}>Mismatch</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.riderId}>
                  <td style={td}>{r.riderName}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.totalDeliveredCodOrders}</td>
                  <td style={{ ...td, textAlign: "right" }}>৳{r.expectedAmount.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right" }}>৳{r.collectedAmount.toLocaleString()}</td>
                  <td
                    style={{
                      ...td,
                      textAlign: "right",
                      color: Math.abs(r.discrepancy) > 1 ? "var(--color-danger)" : "var(--color-text)",
                      fontWeight: 600,
                    }}
                  >
                    ৳{r.discrepancy.toLocaleString()}
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: "right",
                      color: r.mismatchedOrders > 0 ? "var(--color-warning)" : "var(--color-text-muted)",
                      fontWeight: r.mismatchedOrders > 0 ? 700 : 400,
                    }}
                  >
                    {r.mismatchedOrders > 0 ? r.mismatchedOrders : "—"}
                  </td>
                </tr>
              ))}
              <tr style={{ background: "var(--bg-secondary, #f8f8f6)", fontWeight: 700 }}>
                <td style={td}>Total</td>
                <td style={{ ...td, textAlign: "right" }}>{data.totals.totalDeliveredCodOrders}</td>
                <td style={{ ...td, textAlign: "right" }}>৳{data.totals.expected.toLocaleString()}</td>
                <td style={{ ...td, textAlign: "right" }}>৳{data.totals.collected.toLocaleString()}</td>
                <td style={{ ...td, textAlign: "right", color: Math.abs(data.totals.discrepancy) > 1 ? "var(--color-danger)" : "var(--color-text)" }}>
                  ৳{data.totals.discrepancy.toLocaleString()}
                </td>
                <td style={{ ...td, textAlign: "right", color: data.totals.mismatchedOrders > 0 ? "var(--color-warning)" : "var(--color-text-muted)" }}>
                  {data.totals.mismatchedOrders}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {data.overrides.length > 0 && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 4 }}>
            <span style={{ color: "var(--color-warning)" }}>⚠</span> Admin overrides (COD) — needs customer verification
          </h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
            These deliveries were closed by an operator (e.g. rider was offline or customer confirmed verbally). Confirm with the customer that the package + COD amount are correct.
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>Order</th>
                <th style={th}>Customer</th>
                <th style={th}>Area</th>
                <th style={{ ...th, textAlign: "right" }}>Total</th>
                <th style={th}>Closed by</th>
              </tr>
            </thead>
            <tbody>
              {data.overrides.map((o) => (
                <tr key={o.orderId} style={{ background: o.podIncomplete ? "rgba(255,0,0,0.04)" : "transparent" }}>
                  <td style={td}><Link href={`/orders/${o.orderId}`} style={linkStyle}>{o.orderNo}</Link></td>
                  <td style={td}>{o.customerName}<br /><span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{o.customerPhone}</span></td>
                  <td style={td}>{o.area}</td>
                  <td style={{ ...td, textAlign: "right" }}>৳{o.total.toLocaleString()}</td>
                  <td style={td}>
                    <div style={{ fontSize: 12 }}>{o.overrideActor}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                      {new Date(o.deliveredAt).toLocaleString()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div style={{ padding: 12, background: "var(--bg-card, #1d2420)", borderRadius: 10, border: "1px solid var(--border)", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ?? "var(--color-text)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const cardStyle: React.CSSProperties = {
  background: "var(--bg-card, #1d2420)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 16,
};
const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "8px", borderBottom: "1px solid var(--border)" };
const linkStyle: React.CSSProperties = { color: "var(--color-brand)", textDecoration: "none", fontWeight: 600 };