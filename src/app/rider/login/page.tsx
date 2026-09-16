"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/rider-auth";

export default function RiderLoginPage() {
  const router = useRouter();
  const { login, status, session } = useAuth();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authed" && session) {
      router.replace(session.mustChangePin ? "/rider/change-pin" : "/rider/orders");
    }
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <main style={{ padding: 24, color: "var(--color-text-muted)", textAlign: "center" }}>
        Loading…
      </main>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { mustChangePin } = await login(phone.trim(), pin.trim());
      router.replace(mustChangePin ? "/rider/change-pin" : "/rider/orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setSubmitting(false);
    }
  }

  return (
    <main style={{ flex: 1, padding: "32px 20px", maxWidth: 420, margin: "0 auto", width: "100%" }}>
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 700 }}>Dropify Rider</div>
        <div style={{ color: "var(--color-text-muted)", marginTop: 6 }}>Sign in to start your shift</div>
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
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Phone</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
            inputMode="tel"
            autoComplete="tel"
            required
            style={{
              padding: "12px 14px",
              fontSize: 16,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-primary, #fafafa)",
              color: "var(--color-text, #111)",
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>PIN</span>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="4-8 digits"
            inputMode="numeric"
            autoComplete="current-password"
            pattern="\d{4,8}"
            maxLength={8}
            required
            style={{
              padding: "12px 14px",
              fontSize: 18,
              letterSpacing: 4,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-primary, #fafafa)",
              color: "var(--color-text, #111)",
            }}
          />
        </label>
        {error && (
          <div
            role="alert"
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: "var(--tint-danger-18)",
              color: "var(--color-danger)",
              border: "1px solid var(--tint-danger-25)",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "14px 18px",
            background: "var(--color-brand, #1a7a3a)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: submitting ? "wait" : "pointer",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}