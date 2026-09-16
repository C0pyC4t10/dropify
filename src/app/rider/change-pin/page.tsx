"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/rider-auth";
import { riderFetch } from "@/lib/rider-api";

export default function RiderChangePinPage() {
  const router = useRouter();
  const { accessToken, session, status, setAccessToken } = useAuth();
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "guest") {
      router.replace("/rider/login");
    }
  }, [status, router]);

  if (status === "loading") return <main style={{ padding: 24 }}>Loading…</main>;
  if (status === "guest") return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,8}$/.test(newPin)) {
      setError("PIN must be 4 to 8 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setError("New PIN and confirmation don&apos;t match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await riderFetch("/api/rider/change-pin", {
        method: "POST",
        body: JSON.stringify({ oldPin, newPin }),
        accessToken: accessToken!,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `status ${res.status}`);
        setSubmitting(false);
        return;
      }
      if (session) {
        setAccessToken(accessToken!, { ...session, mustChangePin: false });
      }
      router.replace("/rider/orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSubmitting(false);
    }
  }

  return (
    <main style={{ flex: 1, padding: "32px 20px", maxWidth: 420, margin: "0 auto", width: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Change PIN</h1>
        <div style={{ color: "var(--color-text-muted)", marginTop: 4, fontSize: 14 }}>
          Pick a PIN you&apos;ll remember. You&apos;ll use it to sign in next time.
        </div>
      </div>
      <form
        onSubmit={onSubmit}
        style={{
          background: "var(--bg-elevated, #fff)",
          padding: 20,
          borderRadius: 12,
          border: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Current PIN</span>
          <input
            type="password"
            value={oldPin}
            onChange={(e) => setOldPin(e.target.value)}
            inputMode="numeric"
            pattern="\d{4,8}"
            maxLength={8}
            required
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>New PIN</span>
          <input
            type="password"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            inputMode="numeric"
            pattern="\d{4,8}"
            maxLength={8}
            required
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Confirm new PIN</span>
          <input
            type="password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            inputMode="numeric"
            pattern="\d{4,8}"
            maxLength={8}
            required
            style={inputStyle}
          />
        </label>
        {error && (
          <div role="alert" style={errorBox}>{error}</div>
        )}
        <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? "Saving…" : "Save new PIN"}
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 18,
  letterSpacing: 4,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-primary, #fafafa)",
  color: "var(--color-text, #111)",
};

const buttonStyle: React.CSSProperties = {
  padding: "14px 18px",
  background: "var(--color-brand, #1a7a3a)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "var(--tint-danger-18)",
  color: "var(--color-danger)",
  border: "1px solid var(--tint-danger-25)",
  fontSize: 14,
};