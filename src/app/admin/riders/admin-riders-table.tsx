"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

interface Rider {
  id: number;
  name: string;
  phone: string;
  vehicle: string;
  status: string;
  homeCluster: string | null;
  subClusters: string[];
  accountStatus: string;
  tempPin: boolean;
  lastLoginAt: string;
  maxStops: number | null;
}

interface Payload {
  adminMode: boolean;
  riders: Rider[];
}

function readAdminMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.trim() === "dropify_admin_mode=1");
}

export function AdminRidersTable({ initial }: { initial: Payload }) {
  const [adminMode] = useState<boolean>(() => readAdminMode() || initial.adminMode);
  const [busy, setBusy] = useState<number | null>(null);
  const [revealedPin, setRevealedPin] = useState<{ riderId: number; pin: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function refresh() {
    setRefreshKey((k) => k + 1);
  }

  async function resetPin(riderId: number) {
    setBusy(riderId);
    setError(null);
    setRevealedPin(null);
    try {
      const res = await fetch(`/api/riders/${riderId}/pin/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `status ${res.status}`);
      }
      const json = await res.json();
      setRevealedPin({ riderId, pin: json.newPin });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function setRiderStatus(riderId: number, action: "suspend" | "reactivate") {
    setBusy(riderId);
    setError(null);
    try {
      const url = action === "suspend"
        ? `/api/riders/${riderId}/suspend`
        : `/api/riders/${riderId}/reactivate`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `status ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (!adminMode) {
    return (
      <div style={{ padding: "40px 20px", maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
          Admin mode is off. Unlock admin mode from the top-right of any <code>/admin/**</code> page to manage rider accounts.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div>
          <Link href="/admin" className="btn btn-secondary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 8, fontSize: 12 }}>
            <ArrowLeft size={13} /> Back to admin
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Rider management</h1>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
            {initial.riders.length} rider{initial.riders.length === 1 ? "" : "s"} (shared across tenants).
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "#f8d7da", color: "#721c24", marginBottom: 10, fontSize: 14, border: "1px solid #f1aeb5" }}>
          {error}
        </div>
      )}

      {revealedPin && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#d4edda", color: "#155724", marginBottom: 12, border: "1px solid #b1dfbb" }}>
          <strong>New PIN for rider #{revealedPin.riderId}:</strong>{" "}
          <code style={{ fontSize: 18, fontWeight: 700, color: "#0d4a1f" }}>{revealedPin.pin}</code>{" "}
          <span style={{ fontSize: 12, opacity: 0.85 }}>— share with the rider once. They&apos;ll be forced to change it on first login.</span>
        </div>
      )}

      <div style={{ background: "var(--bg-card, #1d2420)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }} key={refreshKey}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Phone</th>
              <th style={th}>Vehicle</th>
              <th style={th}>Cluster</th>
              <th style={th}>Dispatch status</th>
              <th style={th}>Account</th>
              <th style={th}>Last login</th>
              <th style={{ ...th, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {initial.riders.map((r) => (
              <tr key={r.id} style={r.accountStatus !== "active" ? { background: "rgba(255,200,0,0.06)" } : undefined}>
                <td style={td}>
                  <div style={{ fontWeight: 600, color: "var(--text-primary, #eaece8)" }}>{r.name}</div>
                  {r.tempPin && (
                    <div style={{ fontSize: 10, color: "var(--color-warning)", fontWeight: 700 }}>TEMP PIN</div>
                  )}
                </td>
                <td style={td}>{r.phone}</td>
                <td style={td}>{r.vehicle}</td>
                <td style={td}>{r.homeCluster ?? "—"}</td>
                <td style={td}>{r.status}</td>
                <td style={td}>
                  <AccountStatusBadge status={r.accountStatus} />
                </td>
                <td style={td}>{r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString() : "never"}</td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  <button
                    onClick={() => resetPin(r.id)}
                    disabled={busy === r.id}
                    style={actionBtn}
                  >
                    {busy === r.id && revealedPin?.riderId !== r.id ? "…" : "Reset PIN"}
                  </button>
                  {r.accountStatus === "active" || r.accountStatus === "pending_verification" ? (
                    <button
                      onClick={() => setRiderStatus(r.id, "suspend")}
                      disabled={busy === r.id}
                      style={{ ...actionBtn, color: "var(--color-danger)" }}
                    >
                      Suspend
                    </button>
                  ) : (
                    <button
                      onClick={() => setRiderStatus(r.id, "reactivate")}
                      disabled={busy === r.id}
                      style={{ ...actionBtn, color: "var(--color-success)" }}
                    >
                      Reactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: "var(--color-success)",
    pending_verification: "var(--color-warning)",
    suspended: "var(--color-danger)",
    deactivated: "var(--color-text-muted)",
  };
  const color = colorMap[status] ?? "var(--color-text-muted)";
  return (
    <span style={{ padding: "2px 8px", borderRadius: 999, background: color, color: "#fff", fontSize: 11, fontWeight: 600 }}>
      {status}
    </span>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-primary)" };
const actionBtn: React.CSSProperties = {
  padding: "4px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--bg-secondary)",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: 12,
  marginLeft: 4,
};