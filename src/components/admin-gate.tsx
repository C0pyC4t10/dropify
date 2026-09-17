"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Shield, Lock, Unlock } from "lucide-react";

function readStored(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.trim() === `${"dropify_admin_mode"}=1`);
}

function writeStored(value: boolean) {
  if (typeof document === "undefined") return;
  if (value) {
    document.cookie = `${"dropify_admin_mode"}=1; path=/; SameSite=Lax`;
  } else {
    document.cookie = `${"dropify_admin_mode"}=; path=/; Max-Age=0`;
  }
}

/**
 * Wraps every /admin/** page. Until the operator explicitly unlocks admin
 * mode for this browser session, the children render a gate. There's no
 * real auth here — this is a soft guard against a casual operator
 * accidentally landing in the console.
 *
 * In production deployments you'd swap this for SSO / OIDC / RBAC.
 *
 * UX note: the input is purely a "you're sure?" confirmation, NOT a real
 * password. Empty input + Enter / tap "Continue" unlocks (matches the
 * legacy behavior). The pre-filled default is the word "dropify" so
 * mobile operators don't have to type anything — they can just tap the
 * button and go.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [pin, setPin] = useState("dropify");

  useEffect(() => {
    // Defer to next tick so the synchronous initial state doesn't trip the
    // setState-in-effect lint guard.
    const t = setTimeout(() => {
      setUnlocked(readStored());
    }, 0);
    return () => clearTimeout(t);
  }, []);

  function unlock(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault?.();
    // Empty input OR "dropify" (case-insensitive) unlocks. The default
    // value is "dropify" so mobile operators don't need to type anything.
    if (pin.trim().toLowerCase() === "dropify" || pin.trim().length === 0) {
      writeStored(true);
      setUnlocked(true);
    }
  }

  if (unlocked === null) {
    return <div style={{ color: "var(--text-muted)" }}>Loading…</div>;
  }
  if (!unlocked) {
    return (
      <div
        className="card"
        style={{
          maxWidth: 460,
          margin: "60px auto",
          padding: 28,
          textAlign: "center",
        }}
      >
        <Lock size={28} color="var(--accent-amber)" />
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: "12px 0 4px" }}>
          Admin console locked
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px" }}>
          Tap below to open the admin console for this browser. No password
          needed — this is a local soft-gate, not real auth.
        </p>
        <form
          onSubmit={unlock}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input
            type="text"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") unlock(e);
            }}
            placeholder="Type dropify to confirm"
            autoFocus
            style={{ textAlign: "center" }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            onClick={unlock}
            style={{ minHeight: 48 }}
          >
            <Unlock size={14} /> Continue to admin
          </button>
        </form>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 14 }}>
          The pre-filled value above is a confirmation, not a secret. Just
          press Enter or tap the button to continue.
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** Used by the /admin layout to render a "lock console" button when
 *  admin mode is active. */
export function AdminLockButton() {
  return (
    <button
      className="btn btn-secondary"
      onClick={() => {
        writeStored(false);
        if (typeof window !== "undefined") window.location.reload();
      }}
      title="Lock the admin console for this browser"
      style={{ fontSize: 11, padding: "4px 8px" }}
    >
      <Shield size={13} /> Lock
    </button>
  );
}
