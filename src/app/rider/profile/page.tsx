"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/rider-auth";
import { riderGetJson } from "@/lib/rider-api";
import { RiderAppShell } from "@/components/rider/rider-app-shell";
import {
  Bike,
  ChevronRight,
  Clock,
  HelpCircle,
  KeyRound,
  LogOut,
  Phone,
  Shield,
  User,
} from "lucide-react";

interface MeResponse {
  rider: {
    id: number;
    name: string;
    phone: string;
    vehicle: string;
    homeCluster: string | null;
    accountStatus: string;
    lastLoginAt: string;
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatLastLogin(iso: string): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Unknown";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}

function statusLabel(s: string): string {
  switch (s) {
    case "active": return "Active";
    case "pending_verification": return "Pending";
    case "suspended": return "Suspended";
    case "deactivated": return "Deactivated";
    default: return s;
  }
}

function statusColor(s: string): string {
  switch (s) {
    case "active": return "var(--color-success)";
    case "pending_verification": return "var(--color-warning)";
    case "suspended":
    case "deactivated":
      return "var(--color-danger)";
    default:
      return "var(--color-text-muted)";
  }
}

export default function RiderProfilePage() {
  const router = useRouter();
  const { accessToken, session, status, logout } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "guest") router.replace("/rider/login");
  }, [status, router]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken) return;
      try {
        const res = await riderGetJson<MeResponse>("/api/rider/me", accessToken);
        if (!cancelled) setMe(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [accessToken]);

  async function onSignOut() {
    await logout();
    router.replace("/rider/login");
  }

  const r = me?.rider;

  return (
    <RiderAppShell title="Your profile">
      {error && (
        <div role="alert" style={errorBox}>{error}</div>
      )}

      <div style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: 20,
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 16,
      }}>
        <div
          aria-hidden
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--tint-brand-25)",
            color: "var(--color-brand)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initials(r?.name ?? session?.riderName ?? "?")}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>
            {r?.name ?? session?.riderName ?? "—"}
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
            {r?.vehicle ?? session?.vehicle ?? "—"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
            <span style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: statusColor(r?.accountStatus ?? ""),
            }} aria-hidden />
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {statusLabel(r?.accountStatus ?? "")}
            </span>
          </div>
        </div>
      </div>

      <Section title="Your details">
        <DetailRow icon={<Phone size={16} aria-hidden />} label="Phone" value={r?.phone ?? session?.phone ?? "—"} />
        <DetailRow icon={<Bike size={16} aria-hidden />} label="Vehicle" value={r?.vehicle ?? session?.vehicle ?? "—"} />
        <DetailRow icon={<User size={16} aria-hidden />} label="Cluster" value={r?.homeCluster ?? "Not assigned"} />
      </Section>

      <Section title="Security">
        <ActionRow
          icon={<KeyRound size={16} aria-hidden />}
          label="Change PIN"
          description="Pick a new 4–8 digit PIN"
          onClick={() => router.push("/rider/change-pin")}
        />
        <ActionRow
          icon={<Clock size={16} aria-hidden />}
          label="Last sign-in"
          description={r ? formatLastLogin(r.lastLoginAt) : "—"}
        />
      </Section>

      <Section title="Support">
        <ActionRow
          icon={<HelpCircle size={16} aria-hidden />}
          label="Help & support"
          description="Reach the dispatcher, FAQ"
          onClick={() => router.push("/rider/help")}
        />
        <ActionRow
          icon={<Shield size={16} aria-hidden />}
          label="Privacy"
          description="Your data, your control"
          onClick={() => router.push("/rider/help#privacy")}
        />
      </Section>

      <button
        type="button"
        onClick={onSignOut}
        style={{
          width: "100%",
          minHeight: 48,
          marginTop: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--tint-danger-25)",
          color: "var(--color-danger)",
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <LogOut size={16} aria-hidden /> Sign out
      </button>

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "var(--color-text-muted)" }}>
        Dropify Rider · v{process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0"}
      </div>
    </RiderAppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: "var(--color-text-muted)",
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginBottom: 8,
        padding: "0 4px",
      }}>
        {title}
      </div>
      <div style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        overflow: "hidden",
      }}>
        {children}
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 14px",
      borderBottom: "1px solid var(--color-border)",
      minHeight: 44,
    }}>
      <span style={{ color: "var(--color-text-muted)", display: "inline-flex" }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: "var(--color-text-muted)" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, textAlign: "right", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function ActionRow({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "12px 14px",
        minHeight: 56,
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--color-border)",
        textAlign: "left",
        cursor: interactive ? "pointer" : "default",
        color: "var(--color-text)",
        font: "inherit",
      }}
    >
      <span style={{ color: "var(--color-text-muted)", display: "inline-flex" }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>{description}</div>
      </span>
      {interactive && <ChevronRight size={18} aria-hidden style={{ color: "var(--color-text-muted)" }} />}
    </button>
  );
}

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "var(--tint-danger-18)",
  color: "var(--color-danger)",
  border: "1px solid var(--tint-danger-25)",
  marginBottom: 12,
  fontSize: 14,
};