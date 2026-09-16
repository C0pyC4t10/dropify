"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/rider-auth";
import { riderGetJson } from "@/lib/rider-api";

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

        <div style={cardStyle}>
          <Row label="Status" value={order.statusLabel} />
          <Row label="Area" value={order.area} />
          <Row label="Address" value={order.address} />
          <Row label="Phone" value={order.customerPhone} />
          <Row label="Payment" value={`${order.paymentMethod.toUpperCase()} · ৳${order.total.toLocaleString()}`} />
          {order.codDue > 0 && (
            <Row label="Collect on delivery" value={`৳${order.codDue.toLocaleString()}`} highlight />
          )}
          {order.note && <Row label="Note" value={order.note} />}
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}`}
             target="_blank" rel="noreferrer"
             style={mapsButtonStyle}>
            Open in Google Maps
          </a>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Items</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {order.items.map((it, i) => (
              <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
                <span>{it.qty}{it.unit} {it.name}</span>
                <span style={{ color: "var(--color-text-muted)" }}>৳{it.lineTotal.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>

        {pod && (
          <div style={cardStyle}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Proof of delivery</div>
            <Row label="Photo" value={pod.photoPath ? "Uploaded" : "Pending"} />
            <Row label="OTP verified" value={pod.otpVerified ? "Yes" : "No"} />
            {pod.amountCollected !== null && (
              <Row
                label="COD collected"
                value={`৳${pod.amountCollected.toLocaleString()} (expected ৳${(pod.expectedAmount ?? 0).toLocaleString()})`}
              />
            )}
            {pod.photoPath && (
              <a
                href={`/api/rider/orders/${order.id}/pod-photo`}
                target="_blank"
                rel="noreferrer"
                style={mapsButtonStyle}
              >
                View delivery photo
              </a>
            )}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {(order.status === "confirmed" || order.status === "preparing") && (
            <button
              onClick={() => router.push(`/rider/orders/${order.id}/deliver`)}
              style={primaryButtonStyle}
            >
              {order.status === "confirmed" ? "Acknowledge pickup" : "Mark on the way"}
            </button>
          )}
          {order.status === "out-for-delivery" && (
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
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--color-success)", color: "#fff", textAlign: "center", fontWeight: 600 }}>
              Delivered
            </div>
          )}
          {(order.status === "returned" || order.status === "cancelled") && (
            <div style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: order.status === "cancelled" ? "var(--color-danger)" : "var(--color-purple)",
              color: "#fff",
              textAlign: "center",
              fontWeight: 600,
            }}>
              {order.statusLabel}
            </div>
          )}
        </div>

        {history.length > 0 && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", color: "var(--color-text-muted)", fontSize: 13 }}>
              Activity log ({history.length})
            </summary>
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0", fontSize: 12, color: "var(--color-text-muted)" }}>
              {history.slice(0, 8).map((h, i) => (
                <li key={i} style={{ padding: "3px 0" }}>
                  {new Date(h.createdAt).toLocaleString()} · {h.actorName} → {h.toStatus}
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
    </>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span style={{ fontWeight: highlight ? 700 : 500, color: highlight ? "var(--color-warning)" : "var(--color-text)" }}>{value}</span>
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 16px",
  background: "var(--bg-elevated, #fff)",
  borderBottom: "1px solid var(--border)",
};

const backButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: 14,
  cursor: "pointer",
  color: "var(--color-text)",
  padding: "4px 8px",
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-elevated, #fff)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 14,
  marginBottom: 12,
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

const mapsButtonStyle: React.CSSProperties = {
  display: "block",
  textAlign: "center",
  marginTop: 10,
  padding: "10px 12px",
  background: "var(--color-info)",
  color: "#fff",
  textDecoration: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
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