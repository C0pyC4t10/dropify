"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/rider-auth";
import { riderGetJson } from "@/lib/rider-api";
import { RiderOrderMap } from "@/components/rider/rider-order-map";
import {
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  Package,
  Phone,
  Receipt,
} from "lucide-react";

interface OrderDetail {
  id: number;
  orderNo: string;
  companyId: number;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  area: string;
  address: string;
  riderSeq: number | null;
  status: string;
  statusLabel: string;
  paymentMethod: string;
  total: number;
  paid: number;
  codDue: number;
  items: Array<{ productId: number; name: string; qty: number; unit: string; unitPrice: number; lineTotal: number }>;
  note: string;
  lat: number | null;
  lng: number | null;
}

interface PodInfo {
  photoPath: string;
  otpVerified: boolean;
  amountCollected: number | null;
  expectedAmount: number | null;
  capturedAt: string;
}

export default function RiderOrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = Number(params?.id);
  const { accessToken, status } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [pod, setPod] = useState<PodInfo | null>(null);
  const [history, setHistory] = useState<Array<{ toStatus: string; actorName: string; createdAt: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "guest") router.replace("/rider/login");
  }, [status, router]);

  const load = useCallback(async () => {
    if (!accessToken || !Number.isInteger(orderId)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await riderGetJson<{
        order: OrderDetail;
        pod: PodInfo | null;
        history: Array<{ toStatus: string; actorName: string; createdAt: string }>;
      }>(`/api/rider/orders/${orderId}`, accessToken);
      setOrder(res.order);
      setPod(res.pod);
      setHistory(res.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [accessToken, orderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (loading || !order) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }

  return (
    <>
      <header style={headerStyle}>
        <button onClick={() => router.push("/rider/orders")} style={backButtonStyle}>← Back</button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{order.orderNo}</div>
          <div style={{ fontWeight: 700 }}>{order.customerName}</div>
        </div>
        <div style={{ width: 60 }} />
      </header>
      <main style={{ flex: 1, padding: "16px", maxWidth: 720, margin: "0 auto", width: "100%" }}>
        {error && <div style={errorBox}>{error}</div>}

        {/* Hero card — customer + address front and center */}
        <div style={heroCardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={avatarStyle}>{initialsOf(order.customerName)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>
                {order.customerName}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 12, color: "var(--color-text-muted)" }}>
                <Phone size={12} aria-hidden />
                <a href={`tel:${order.customerPhone}`} style={{ color: "var(--color-text-secondary)", textDecoration: "none" }}>
                  {order.customerPhone}
                </a>
              </div>
            </div>
            <span style={statusBadgeStyle(order.status)}>{order.statusLabel}</span>
          </div>
          <div style={heroAddressRow}>
            <MapPin size={16} aria-hidden style={{ color: "var(--color-brand)", flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>
                {order.address || <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>No address on file</span>}
              </div>
              {order.area && (
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                  {order.area}
                </div>
              )}
            </div>
          </div>
          {order.note && (
            <div style={noteRow}>
              <span style={noteLabel}>Note</span>
              <span style={noteValue}>{order.note}</span>
            </div>
          )}
        </div>

        {/* Payment summary — single readable row */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <CreditCard size={14} aria-hidden style={{ color: "var(--color-text-muted)" }} />
            <span>Payment</span>
          </div>
          <div style={paymentRow}>
            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--color-text-muted)" }}>
                Method
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
                {order.paymentMethod === "cod" ? "Cash on delivery" : order.paymentMethod.toUpperCase()}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--color-text-muted)" }}>
                {order.paymentMethod === "cod" ? "Collect" : "Paid"}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: order.paymentMethod === "cod" ? "var(--color-warning)" : "var(--color-success)" }}>
                ৳{order.paymentMethod === "cod" ? order.codDue.toLocaleString() : order.total.toLocaleString()}
              </div>
            </div>
          </div>
          {order.paymentMethod === "cod" && order.total > order.codDue && (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
              Already paid ৳{(order.total - order.codDue).toLocaleString()} · ৳{order.codDue.toLocaleString()} due on delivery
            </div>
          )}
        </div>

        {/* Items */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <Package size={14} aria-hidden style={{ color: "var(--color-text-muted)" }} />
            <span>Items ({order.items.length})</span>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {order.items.map((it, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  padding: "10px 0",
                  borderBottom: i < order.items.length - 1 ? "1px solid var(--color-border)" : "none",
                  fontSize: 14,
                }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 700, marginRight: 6 }}>{it.qty}{it.unit}</span>
                  <span>{it.name}</span>
                  <span style={{ color: "var(--color-text-muted)", fontSize: 12, marginLeft: 6 }}>
                    ৳{it.unitPrice.toLocaleString()}/{it.unit}
                  </span>
                </span>
                <span style={{ fontWeight: 700, color: "var(--color-text)" }}>
                  ৳{it.lineTotal.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Map */}
        {order.lat != null && order.lng != null && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <MapPin size={14} aria-hidden style={{ color: "var(--color-text-muted)" }} />
              <span>Drop-off location</span>
            </div>
            <RiderOrderMap
              pin={{ lat: order.lat, lng: order.lng }}
              orderNo={order.orderNo}
              customerName={order.customerName}
              address={`${order.address}${order.area ? `, ${order.area}` : ""}`}
            />
          </div>
        )}

        {/* POD summary */}
        {/* Only render the POD card when the order has actually reached a
            terminal status. Stale POD data (a leftover row with
            otpVerified=true from a previous delivery, a re-assignment, or
            the empty row the rider app inserts on first 'Send code' tap)
            is hidden entirely on orders still in flight. */}
        {pod && (order.status === "delivered" || order.status === "returned" || order.status === "cancelled") && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <Receipt size={14} aria-hidden style={{ color: "var(--color-text-muted)" }} />
              <span>Proof of delivery</span>
            </div>
            <PodRow
              icon={<CheckCircle2 size={14} aria-hidden />}
              label="OTP verified"
              ok={pod.otpVerified}
            />
            {pod.amountCollected !== null && (
              <div style={podMoneyRow}>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>COD collected</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>
                  ৳{pod.amountCollected.toLocaleString()}
                  {pod.expectedAmount != null && (
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: 4, fontWeight: 400 }}>
                      / expected ৳{pod.expectedAmount.toLocaleString()}
                    </span>
                  )}
                </span>
              </div>
            )}
            {pod.photoPath && (
              <a
                href={`/api/rider/orders/${order.id}/pod-photo`}
                target="_blank"
                rel="noreferrer"
                style={photoButtonStyle}
              >
                View delivery photo
              </a>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          {(order.status === "confirmed" || order.status === "preparing") && (
            <button
              onClick={() => router.push(`/rider/orders/${order.id}/deliver`)}
              style={primaryButtonStyle}
            >
              {order.status === "confirmed" ? "Acknowledge pickup" : "Mark on the way"}
            </button>
          )}
          {(order.status === "out-for-delivery") && (
            <button
              onClick={() => router.push(`/rider/orders/${order.id}/deliver`)}
              style={primaryButtonStyle}
            >
              Complete delivery
            </button>
          )}
          {(order.status === "confirmed" || order.status === "preparing" || order.status === "out-for-delivery") && (
            <button
              onClick={() => router.push(`/rider/orders/${order.id}/fail`)}
              style={secondaryButtonStyle}
            >
              Mark as failed
            </button>
          )}
          {order.status === "delivered" && (
            <div style={terminalBanner("var(--color-success)")}>Delivered</div>
          )}
          {(order.status === "returned" || order.status === "cancelled") && (
            <div style={terminalBanner(order.status === "cancelled" ? "var(--color-danger)" : "var(--color-purple)")}>
              {order.statusLabel}
            </div>
          )}
        </div>

        {history.length > 0 && (
          <details style={{ marginTop: 18, padding: "10px 14px", background: "var(--bg-elevated)", border: "1px solid var(--color-border)", borderRadius: 12 }}>
            <summary style={{ cursor: "pointer", color: "var(--color-text-muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={12} aria-hidden /> Activity log ({history.length})
            </summary>
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
              {history.slice(0, 8).map((h, i) => (
                <li key={i} style={{ padding: "4px 0", borderTop: i > 0 ? "1px solid var(--color-border)" : "none" }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>{new Date(h.createdAt).toLocaleString()}</span>
                  {" · "}
                  {h.actorName}
                  {" → "}
                  <span style={{ color: "var(--color-text)" }}>{h.toStatus}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
    </>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function PodRow({ icon, label, ok }: { icon: React.ReactNode; label: string; ok: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--color-text-muted)" }}>
        {icon}
        {label}
      </div>
      <span style={{
        fontSize: 12,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        background: ok ? "var(--tint-success-18)" : "var(--tint-warning-18)",
        color: ok ? "var(--color-success)" : "var(--color-warning)",
      }}>
        {ok ? "Yes" : "Pending"}
      </span>
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 16px",
  background: "var(--bg-elevated)",
  borderBottom: "1px solid var(--color-border)",
};

const backButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: 14,
  cursor: "pointer",
  color: "var(--color-text)",
  padding: "4px 8px",
};

const heroCardStyle: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--color-border)",
  borderRadius: 14,
  padding: 18,
  marginBottom: 12,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const avatarStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: "50%",
  background: "var(--tint-brand-18)",
  color: "var(--color-brand)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: 16,
  flexShrink: 0,
};

function statusBadgeStyle(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    delivered: { bg: "var(--tint-success-18)", fg: "var(--color-success)" },
    cancelled: { bg: "var(--tint-danger-18)", fg: "var(--color-danger)" },
    returned: { bg: "var(--tint-brand-12)", fg: "var(--color-purple)" },
    "out-for-delivery": { bg: "var(--tint-brand-25)", fg: "var(--color-brand)" },
    preparing: { bg: "var(--tint-info-12)", fg: "var(--color-info)" },
    confirmed: { bg: "var(--tint-warning-18)", fg: "var(--color-warning)" },
  };
  const colors = map[status] ?? { bg: "var(--color-bg-hover)", fg: "var(--color-text-muted)" };
  return {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    background: colors.bg,
    color: colors.fg,
    flexShrink: 0,
    whiteSpace: "nowrap",
  };
}

const heroAddressRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "12px 14px",
  background: "var(--color-bg-hover)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
};

const noteRow: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "10px 12px",
  background: "var(--tint-warning-18)",
  border: "1px solid var(--tint-warning-25)",
  borderRadius: 10,
};

const noteLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--color-warning)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const noteValue: React.CSSProperties = {
  fontSize: 13,
  color: "var(--color-text)",
  lineHeight: 1.4,
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--color-border)",
  borderRadius: 14,
  padding: 16,
  marginBottom: 12,
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  fontWeight: 700,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: 0.8,
  marginBottom: 12,
};

const paymentRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 12,
};

const podMoneyRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 0",
  borderTop: "1px solid var(--color-border)",
  marginTop: 6,
};

const photoButtonStyle: React.CSSProperties = {
  display: "block",
  textAlign: "center",
  marginTop: 12,
  padding: "10px 12px",
  background: "var(--color-bg-hover)",
  color: "var(--color-text)",
  textDecoration: "none",
  borderRadius: 10,
  border: "1px solid var(--color-border)",
  fontSize: 13,
  fontWeight: 600,
};

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "var(--tint-danger-18)",
  color: "var(--color-danger)",
  border: "1px solid var(--tint-danger-25)",
  marginBottom: 10,
  fontSize: 14,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "14px 18px",
  background: "var(--color-brand)",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  minHeight: 48,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "12px 18px",
  background: "transparent",
  color: "var(--color-danger)",
  border: "1px solid var(--color-danger)",
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 44,
};

function terminalBanner(bg: string): React.CSSProperties {
  return {
    padding: "14px 16px",
    borderRadius: 10,
    background: bg,
    color: "#fff",
    textAlign: "center",
    fontWeight: 700,
    fontSize: 15,
  };
}