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
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");

  useEffect(() => {
    // Defer to next tick so the synchronous initial state doesn't trip the
    // setState-in-effect lint guard.
    const t = setTimeout(() => {
      setUnlocked(readStored());
    }, 0);
    return () => clearTimeout(t);
  }, []);

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
          Confirm to unlock — anyone with this URL can manage every company,
          category, and unit on the platform.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // The "pin" field is intentionally not enforced server-side —
            // it's a typed confirmation, not a secret. Dropify Ops is
            // designed to be self-hosted by trusted operators.
            if (pin.toLowerCase() === "dropify" || pin.length === 0) {
              writeStored(true);
              setUnlocked(true);
            }
          }}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Type dropify to confirm"
            autoFocus
            style={{ textAlign: "center" }}
          />
          <button type="submit" className="btn btn-primary">
            <Unlock size={14} /> Unlock admin console
          </button>
        </form>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 14 }}>
          Tip: leave the box blank and click unlock to confirm without typing.
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** Used by the /admin layout to render a "lock console" button when
 *  admin mode is active. */
export function AdminLockButton() {
  const [, force] = useState(0);
  return (
    <button
      className="btn btn-secondary"
      onClick={() => {
        writeStored(false);
        force((n) => n + 1);
        // Force a re-render of AdminGate via location reload (cheap + reliable).
        if (typeof window !== "undefined") window.location.reload();
      }}
      title="Lock the admin console for this browser"
      style={{ fontSize: 11, padding: "4px 8px" }}
    >
      <Shield size={13} /> Lock
    </button>
  );
}
