"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useOnlineFlush } from "@/lib/rider-auth";
import { riderGetJson } from "@/lib/rider-api";
import { flushQueue, listPending, type QueuedAction } from "@/lib/rider-offline-queue";
import { RiderAppShell } from "@/components/rider/rider-app-shell";
import { Phone, MapPin, RefreshCw, Inbox } from "lucide-react";

function pendingPhotoCountSync(items: QueuedAction[]): number {
  return items.filter((i) => !!i.photoBlob).length;
}

function pendingBytesSync(items: QueuedAction[]): number {
  let bytes = 0;
  for (const item of items) {
    if (item.photoBlob) bytes += item.photoBlob.size;
    bytes += 256;
  }
  return bytes;
}

interface OrderSummary {
  id: number;
  orderNo: string;
  companyId: number;
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
  lat: number | null;
  lng: number | null;
  itemCount: number;
  itemSummary: string;
}

interface TodayResponse {
  date: string;
  summary: { total: number; pending: number; delivered: number; failed: number; codExpected: number };
  orders: OrderSummary[];
}

interface MeResponse {
  rider: { id: number; name: string; phone: string; vehicle: string; homeCluster: string | null; accountStatus: string };
  today: { date: string; codExpected: number; delivered: number; failed: number; pending: number; totalOrders: number };
}

export default function RiderOrdersPage() {
  const router = useRouter();
  const { accessToken, session, status } = useAuth();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<QueuedAction[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState(0);
  const [pendingSize, setPendingSize] = useState(0);
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    if (status === "guest") router.replace("/rider/login");
  }, [status, router]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [today, meRes, queue] = await Promise.all([
        riderGetJson<TodayResponse>(`/api/rider/orders/today`, accessToken),
        riderGetJson<MeResponse>(`/api/rider/me`, accessToken),
        listPending(),
      ]);
      setData(today);
      setMe(meRes);
      setPending(queue);
      setPendingPhotos(pendingPhotoCountSync(queue));
      setPendingSize(pendingBytesSync(queue));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    function goOnline() { setOnline(true); }
    function goOffline() { setOnline(false); }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const flush = useCallback(async () => {
    if (!accessToken) return;
    const result = await flushQueue(accessToken);
    if (result.flushed > 0) {
      await load();
    }
    if (result.errors.length > 0 || result.flushed > 0) {
      const parts: string[] = [];
      if (result.flushed > 0) parts.push(`Synced ${result.flushed}`);
      if (result.errors.length > 0) parts.push(`${result.errors.length} still pending`);
      setError(parts.join(" · ") + ".");
    }
  }, [accessToken, load]);

  useOnlineFlush(flush);

  const headerTitle = me?.rider.vehicle
    ? `${me.rider.vehicle}${me.rider.homeCluster ? ` · ${me.rider.homeCluster}` : ""} · ${data?.date ?? ""}`
    : data?.date;

  if (status === "loading") {
    return (
      <RiderAppShell title={session?.vehicle}>
        <div style={{ padding: 24, color: "var(--color-text-muted)" }}>Loading…</div>
      </RiderAppShell>
    );
  }

  return (
    <RiderAppShell title={headerTitle}>
      {data && <SummaryStrip summary={data.summary} />}
      {pending.length > 0 && (
        <div style={pendingStyle}>
          <div style={{ flex: 1 }}>
            <strong>{pending.length}</strong> deliver{pending.length === 1 ? "y" : "ies"} waiting to sync
            {pendingPhotos > 0 && (
              <> · <strong>{pendingPhotos}</strong> photo{pendingPhotos === 1 ? "" : "s"}</>
            )}
            {" "}({(pendingSize / 1024).toFixed(0)} KB)
          </div>
          <button onClick={flush} style={pendingButtonStyle} disabled={!online} aria-label="Sync pending deliveries">
            <RefreshCw size={14} aria-hidden /> Sync
          </button>
        </div>
      )}
      {error && (
        <div role="alert" style={errorBox}>{error}</div>
      )}
      {!loading && data && data.orders.length === 0 && (
        <EmptyState />
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {data?.orders.map((o) => (
          <li key={o.id}>
            <OrderCard order={o} />
          </li>
        ))}
      </ul>
    </RiderAppShell>
  );
}

function SummaryStrip({ summary }: { summary: TodayResponse["summary"] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
      <Tile label="Total" value={summary.total} accent="var(--color-text)" />
      <Tile label="Pending" value={summary.pending} accent="var(--color-info)" />
      <Tile label="Delivered" value={summary.delivered} accent="var(--color-success)" />
      <Tile label="COD" value={`৳${summary.codExpected.toLocaleString()}`} accent="var(--color-warning)" small />
    </div>
  );
}

function Tile({ label, value, accent, small }: { label: string; value: number | string; accent: string; small?: boolean }) {
  return (
    <div style={{
      padding: 10,
      background: "var(--bg-elevated)",
      borderRadius: 10,
      border: "1px solid var(--color-border)",
      textAlign: "center",
    }}>
      <div style={{ fontSize: small ? 14 : 20, fontWeight: 700, color: accent, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function OrderCard({ order }: { order: OrderSummary }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(`/rider/orders/${order.id}`)}
      style={orderCardStyle}
      aria-label={`Order ${order.orderNo} for ${order.customerName}`}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          {order.riderSeq != null && (
            <span style={seqBadgeStyle} aria-label={`Stop ${order.riderSeq}`}>{order.riderSeq}</span>
          )}
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {order.customerName}
          </div>
        </div>
        <StatusPill status={order.status} label={order.statusLabel} />
      </div>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
        <MapPin size={12} aria-hidden style={{ flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.area}</span>
        <span style={{ color: "var(--color-text-muted)" }}>·</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.itemSummary}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 8 }}>
        <span style={{ color: "var(--color-text-muted)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{order.orderNo}</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: order.paymentMethod === "cod" ? "var(--color-warning)" : "var(--color-text-secondary)" }}>
          {order.paymentMethod === "cod" ? `৳${order.codDue.toLocaleString()} COD` : `৳${order.total.toLocaleString()} paid`}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <a
          href={`tel:${order.customerPhone}`}
          onClick={(e) => e.stopPropagation()}
          style={quickActionStyle}
          aria-label={`Call ${order.customerName}`}
        >
          <Phone size={14} aria-hidden /> Call
        </a>
        {order.lat != null && order.lng != null && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={quickActionStyle}
            aria-label="Open in Google Maps"
          >
            <MapPin size={14} aria-hidden /> Maps
          </a>
        )}
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div style={{
      textAlign: "center",
      padding: "48px 16px",
      color: "var(--color-text-muted)",
      background: "var(--bg-elevated)",
      borderRadius: 12,
      border: "1px dashed var(--color-border)",
    }}>
      <Inbox size={36} aria-hidden style={{ color: "var(--color-text-muted)", marginBottom: 8 }} />
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text)" }}>Waiting for assignments</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>We&apos;ll ping you the moment a delivery lands on your queue.</div>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  delivered: "var(--color-success)",
  cancelled: "var(--color-danger)",
  returned: "var(--color-purple)",
  "out-for-delivery": "var(--color-brand)",
  preparing: "var(--color-info)",
  confirmed: "var(--color-info)",
};

function StatusPill({ status, label }: { status: string; label: string }) {
  const bg = STATUS_COLOR[status] ?? "var(--color-text-muted)";
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

const pendingStyle: React.CSSProperties = {
  background: "var(--tint-warning-18)",
  color: "var(--color-text)",
  border: "1px solid var(--tint-warning-25)",
  padding: "12px 14px",
  borderRadius: 10,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
  fontSize: 13,
  gap: 12,
};

const pendingButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 36,
  padding: "0 12px",
  background: "var(--color-warning)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
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

const orderCardStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  background: "var(--bg-elevated)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  padding: 14,
  cursor: "pointer",
  color: "inherit",
  font: "inherit",
  minHeight: 44,
};

const seqBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: "50%",
  background: "var(--color-brand)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0,
};

const quickActionStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 32,
  padding: "0 10px",
  borderRadius: 8,
  background: "var(--color-bg-hover)",
  color: "var(--color-text)",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid var(--color-border)",
};