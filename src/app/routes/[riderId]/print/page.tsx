"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Printer, ArrowLeft } from "lucide-react";
import type { Order, Rider, Settings } from "@/lib/types";
import { formatMoney } from "@/lib/ui";

function bdToday(): string {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function distanceLabel(m: number): string {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}
function etaLabel(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function PrintContent() {
  const params = useParams<{ riderId: string }>();
  const search = useSearchParams();
  const riderId = Number(params?.riderId);
  const date = search?.get("date") || bdToday();
  const [rider, setRider] = useState<Rider | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [shop, setShop] = useState<{ lat: number; lng: number } | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!riderId) return;
    setLoading(true);
    try {
      const [planRes, ridersRes, settingsRes] = await Promise.all([
        fetch(`/api/routes/${riderId}?date=${date}`).then((r) => r.json()),
        fetch(`/api/riders`).then((r) => r.json() as Promise<Rider[]>),
        fetch(`/api/settings`).then((r) => r.json() as Promise<Settings>),
      ]);
      setRider(((ridersRes as Rider[]) ?? []).find((x) => x.id === riderId) ?? null);
      setOrders(((planRes as { orders: Order[] }).orders ?? []).slice().sort((a, b) => (a.riderSeq ?? 0) - (b.riderSeq ?? 0)));
      setShop((planRes as { shop: { lat: number; lng: number } }).shop);
      setSettings(settingsRes);
    } finally {
      setLoading(false);
    }
  }, [riderId, date]);

  useEffect(() => {
    load();
  }, [load]);

  // Compute total distance
  let totalDistance = 0;
  if (shop) {
    let prev: { lat: number; lng: number } | null = shop;
    for (const o of orders) {
      if (typeof o.lat === "number" && typeof o.lng === "number" && prev) {
        const R = 6371000;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(o.lat - prev.lat);
        const dLng = toRad(o.lng - prev.lng);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(prev.lat)) * Math.cos(toRad(o.lat)) * Math.sin(dLng / 2) ** 2;
        totalDistance += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        prev = { lat: o.lat, lng: o.lng };
      }
    }
  }
  const totalSeconds = totalDistance / (30_000 / 3600);

  // Auto-print once loaded
  useEffect(() => {
    if (!loading && rider && orders.length > 0) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [loading, rider, orders.length]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>;
  }
  if (!rider) {
    return <div style={{ padding: 40, textAlign: "center" }}>Rider not found.</div>;
  }

  const totalValue = orders.reduce((s, o) => s + o.total, 0);
  const totalCollected = orders.reduce((s, o) => s + o.paid, 0);
  const totalCOD = orders.reduce((s, o) => s + Math.max(0, o.total - o.paid), 0);

  return (
    <div style={{ background: "var(--bg-page, #0e0f10)", minHeight: "100vh", padding: 16 }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
        <Link href={`/routes/${riderId}?date=${date}`} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)", textDecoration: "none" }}>
          <ArrowLeft size={14} /> Back to planner
        </Link>
        <button onClick={() => window.print()} className="btn btn-primary" style={{ fontSize: 13 }}>
          <Printer size={14} /> Print
        </button>
      </div>

      <div
        style={{
          maxWidth: 800,
          margin: "0 auto",
          background: "#fff",
          color: "#000",
          padding: "32px 40px",
          borderRadius: 8,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ borderBottom: "2px solid #000", paddingBottom: 12, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{settings?.businessName ?? "Bazarey Ltd"}</div>
            <div style={{ fontSize: 12, color: "#444" }}>Route Plan · {rider.name} · {date}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "#444" }}>
            <div>{orders.length} stop{orders.length !== 1 ? "s" : ""}</div>
            <div>{distanceLabel(totalDistance)} · {etaLabel(totalSeconds)}</div>
          </div>
        </div>

        {/* Sequence table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#000", color: "#fff" }}>
              <th style={{ padding: "6px 8px", textAlign: "left", width: 36 }}>#</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Customer / Order</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Phone</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Address</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Items</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Total</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>COD</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o, idx) => {
              const items = o.items.map((it) => `${it.qty}${it.unit === "kg" ? "kg" : "pc"} ${it.name}`).join(", ");
              const cod = Math.max(0, o.total - o.paid);
              return (
                <tr key={o.id} style={{ borderBottom: "1px solid #999" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 800, fontSize: 14 }}>{idx + 1}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <div style={{ fontWeight: 700 }}>{o.customerName}</div>
                    <div style={{ fontSize: 10, color: "#555" }}>{o.orderNo}</div>
                  </td>
                  <td style={{ padding: "6px 8px", fontSize: 11 }}>{o.customerPhone}</td>
                  <td style={{ padding: "6px 8px", fontSize: 11 }}>
                    <div style={{ fontWeight: 600 }}>{o.area}</div>
                    {o.address && <div style={{ fontSize: 10, color: "#555" }}>{o.address}</div>}
                  </td>
                  <td style={{ padding: "6px 8px", fontSize: 11, maxWidth: 180, overflow: "hidden" }}>{items}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{formatMoney(o.total)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: cod > 0 ? "#b91c1c" : "#16a34a" }}>
                    {cod > 0 ? formatMoney(cod) : "PAID"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ marginTop: 20, padding: 12, border: "2px solid #000", borderRadius: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Total value:</span>
            <strong>{formatMoney(totalValue)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Already collected:</span>
            <strong>{formatMoney(totalCollected)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gridColumn: "1 / -1", paddingTop: 6, borderTop: "1px solid #000", fontSize: 14 }}>
            <span style={{ fontWeight: 700 }}>Cash to collect (COD):</span>
            <strong style={{ fontWeight: 800 }}>{formatMoney(totalCOD)}</strong>
          </div>
        </div>

        {/* Signature */}
        <div style={{ marginTop: 32, display: "flex", justifyContent: "space-between", gap: 40, fontSize: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: 4, marginTop: 40 }}>Rider signature</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: 4, marginTop: 40 }}>Dispatch signature</div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "#666" }}>
          Generated {new Date().toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })} · {distanceLabel(totalDistance)} · {etaLabel(totalSeconds)}
        </div>
      </div>

      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          @page { margin: 12mm; }
        }
      `}</style>
    </div>
  );
}

export default function PrintPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
      <PrintContent />
    </Suspense>
  );
}
