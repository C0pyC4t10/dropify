"use client";

import { useEffect, useState } from "react";
import type { OrderStatus } from "@/lib/types";

interface StepView {
  status: OrderStatus | null;
  label: string;
  description: string;
  done: boolean;
  current: boolean;
}

interface RiderInfo {
  name: string;
}

export interface TrackingPayload {
  trackingCode: string;
  status: OrderStatus;
  statusLabel: string;
  orderNo: string;
  customerName: string;
  area: string;
  itemCount: number;
  itemSummary: string;
  placedAt: string;
  confirmedAt: string;
  deliveredAt: string;
  returnedAt: string;
  cancelledAt: string;
  paymentMethod: string;
  total: number;
  codCollected: number | null;
  podPhotoPath: string | null;
  etaText: string | null;
  steps: StepView[];
  rider: RiderInfo | null;
}

const STATUS_COLOR: Record<OrderStatus, string> = {
  "pending-approval": "var(--color-warning)",
  "new":              "var(--color-warning)",
  "confirmed":        "var(--color-info)",
  "preparing":        "var(--color-info)",
  "out-for-delivery": "var(--color-brand)",
  "delivered":        "var(--color-success)",
  "cancelled":        "var(--color-danger)",
  "returned":         "var(--color-danger)",
};

function formatTime(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function TrackingView({ initial }: { initial: TrackingPayload }) {
  const [data, setData] = useState<TrackingPayload>(initial);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const POLL_MS = 15000;

    async function poll() {
      try {
        const res = await fetch(`/api/track/${initial.trackingCode}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = await res.json();
        if (!cancelled && json.ok) {
          setData(json);
          setLastUpdated(Date.now());
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("Couldn't refresh — showing the last status we have.");
        }
      }
    }

    poll();
    const handle = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [initial.trackingCode]);

  const accent = STATUS_COLOR[data.status] ?? "var(--color-text)";
  const isFailure = data.status === "cancelled" || data.status === "returned";

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "var(--color-text-muted)" }}>
          Tracking code
        </div>
        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 24, fontWeight: 700, color: "var(--color-text)" }}>
          {data.trackingCode}
        </div>
        <div style={{ marginTop: 4, color: "var(--color-text-muted)", fontSize: 13 }}>
          Order {data.orderNo} · {data.itemCount} item{data.itemCount === 1 ? "" : "s"}
        </div>
      </div>

      <div
        style={{
          padding: "16px 18px",
          borderRadius: 12,
          background: "var(--bg-elevated, #fff)",
          border: `1px solid ${accent}`,
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 13, color: accent, fontWeight: 600 }}>Current status</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: "var(--color-text)" }}>
          {data.statusLabel}
        </div>
        {data.etaText && (
          <div style={{ marginTop: 8, color: "var(--color-text-secondary)", fontSize: 14 }}>
            {data.etaText}
          </div>
        )}
        {data.rider && (
          <div style={{ marginTop: 8, color: "var(--color-text-secondary)", fontSize: 14 }}>
            Rider: <strong>{data.rider.name}</strong>
          </div>
        )}
      </div>

      <div
        style={{
          padding: "20px",
          borderRadius: 12,
          background: "var(--bg-elevated, #fff)",
          border: "1px solid var(--border)",
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 12 }}>What&apos;s happening</div>
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {data.steps.map((step, i) => (
            <li
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr",
                gap: 12,
                padding: "10px 0",
                alignItems: "start",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: step.done || step.current ? accent : "var(--bg-secondary, #eee)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  marginTop: 2,
                }}
              >
                {step.done ? "✓" : i + 1}
              </div>
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    color: step.current ? "var(--color-text)" : step.done ? "var(--color-text-secondary)" : "var(--color-text-muted)",
                  }}
                >
                  {step.label}
                </div>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>{step.description}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {data.paymentMethod === "cod" && (
        <div
          style={{
            padding: "16px 18px",
            borderRadius: 12,
            background: "var(--bg-elevated, #fff)",
            border: "1px solid var(--border)",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Cash on delivery</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
            ৳{(data.codCollected ?? data.total).toLocaleString()}
            {data.codCollected !== null && data.codCollected !== data.total && (
              <span style={{ fontSize: 13, color: "var(--color-warning)", marginLeft: 8 }}>
                (collected ৳{data.codCollected.toLocaleString()}, expected ৳{data.total.toLocaleString()})
              </span>
            )}
          </div>
        </div>
      )}

      {data.podPhotoPath && (
        <div
          style={{
            padding: "16px 18px",
            borderRadius: 12,
            background: "var(--bg-elevated, #fff)",
            border: "1px solid var(--border)",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 8 }}>
            Proof of delivery
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.podPhotoPath}
            alt="Delivery photo"
            style={{ maxWidth: "100%", borderRadius: 8, display: "block" }}
          />
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--color-text-muted)", textAlign: "center" }}>
        {error
          ? error
          : lastUpdated
          ? `Auto-refreshes every 15s · last updated ${formatTime(new Date(lastUpdated).toISOString())}`
          : "Auto-refreshes every 15 seconds"}
        {isFailure && (
          <div style={{ marginTop: 6, color: "var(--color-danger)" }}>
            Need help? Reply to your order confirmation SMS or call the shop.
          </div>
        )}
      </div>
    </div>
  );
}