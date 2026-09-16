"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/rider-auth";
import { riderFetch, riderGetJson } from "@/lib/rider-api";
import { enqueueAction } from "@/lib/rider-offline-queue";

interface FailReason { code: string; label: string; }

export default function RiderFailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = Number(params?.id);
  const { accessToken, status } = useAuth();
  const [reasons, setReasons] = useState<FailReason[]>([]);
  const [code, setCode] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [online, setOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    if (status === "guest") router.replace("/rider/login");
  }, [status, router]);

  useEffect(() => {
    if (!accessToken || !Number.isInteger(orderId)) return;
    (async () => {
      try {
        const res = await riderGetJson<{ failReasons: FailReason[] }>(`/api/rider/orders/${orderId}`, accessToken);
        setReasons(res.failReasons);
        if (res.failReasons.length > 0) setCode(res.failReasons[0].code);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      }
    })();
  }, [accessToken, orderId]);

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

  useEffect(() => {
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { timeout: 5000, enableHighAccuracy: false }
      );
    }
  }, []);

  async function onSubmit() {
    if (!accessToken) return;
    if (!code) {
      setError("Pick a reason.");
      return;
    }
    const reason = code === "other" && note.trim() ? `other: ${note.trim()}` : code;
    if (!online) {
      await enqueueAction({
        id: `${orderId}-fail-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        orderId,
        toStatus: "returned",
        reason,
        lat: coords.lat,
        lng: coords.lng,
      });
      router.replace(`/rider/orders/${orderId}`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await riderFetch(`/api/rider/orders/${orderId}/transition`, {
        method: "POST",
        body: JSON.stringify({ toStatus: "returned", reason, lat: coords.lat, lng: coords.lng }),
        accessToken,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `status ${res.status}`);
      }
      router.replace(`/rider/orders/${orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSubmitting(false);
    }
  }

  return (
    <>
      <header style={headerStyle}>
        <button onClick={() => router.back()} style={backBtn}>← Back</button>
        <div style={{ fontWeight: 700 }}>Mark as failed</div>
        <div style={{ width: 60 }} />
      </header>
      <main style={{ flex: 1, padding: "16px", maxWidth: 720, margin: "0 auto", width: "100%" }}>
        {!online && (
          <div style={offlineBanner}>
            You&apos;re offline. This update will queue and sync when you&apos;re back online.
          </div>
        )}
        {error && <div style={errorBox}>{error}</div>}

        <div style={cardStyle}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Reason</span>
            <select
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={inputStyle}
            >
              {reasons.map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
          </label>

          {code === "other" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Note</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
                placeholder="What happened?"
              />
            </label>
          )}

          <button
            disabled={submitting}
            onClick={onSubmit}
            style={primaryBtn}
          >
            {submitting ? "Saving…" : "Mark as failed"}
          </button>
        </div>
      </main>
    </>
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
const backBtn: React.CSSProperties = {
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
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};
const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 16,
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--bg-primary)",
  color: "var(--color-text)",
  minHeight: 44,
};
const primaryBtn: React.CSSProperties = {
  padding: "14px 18px",
  background: "var(--color-danger)",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  minHeight: 48,
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
const offlineBanner: React.CSSProperties = {
  background: "var(--tint-warning-18)",
  color: "var(--color-warning)",
  padding: "8px 12px",
  borderRadius: 8,
  marginBottom: 10,
  fontSize: 13,
};