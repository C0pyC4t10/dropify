"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/rider-auth";
import { riderFetch, riderGetJson } from "@/lib/rider-api";
import { RiderAppShell } from "@/components/rider/rider-app-shell";
import { RiderAvatar } from "@/components/rider/rider-avatar";
import { downscaleImage } from "@/lib/image-downscale";
import {
  Bike,
  Camera,
  ChevronRight,
  Clock,
  HelpCircle,
  KeyRound,
  Loader2,
  LogOut,
  Phone,
  Shield,
  Trash2,
  User,
  X,
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
    avatarUrl: string | null;
  };
}

type UploadPhase = "idle" | "resizing" | "uploading" | "done";

interface PreviewState {
  url: string;            // blob URL of the ORIGINAL image (for preview)
  originalBytes: number;
  width: number;
  height: number;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
  const [avatarTick, setAvatarTick] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [removing, setRemoving] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [resizedBytes, setResizedBytes] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  // Release any object URL when the preview unmounts.
  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  function resetUpload() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setResizedBytes(null);
    setUploadPhase("idle");
  }

  async function onSignOut() {
    await logout();
    router.replace("/rider/login");
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file || !accessToken) return;
    setError(null);
    setUploadPhase("resizing");
    setResizedBytes(null);

    // Build an immediate preview of the original image.
    const previewUrl = URL.createObjectURL(file);
    let dims = { width: 0, height: 0 };
    try {
      const probe = new Image();
      probe.src = previewUrl;
      await new Promise<void>((resolve) => {
        probe.onload = () => {
          dims = { width: probe.naturalWidth, height: probe.naturalHeight };
          resolve();
        };
        probe.onerror = () => resolve();
      });
    } catch { /* ignore */ }

    setPreview({
      url: previewUrl,
      originalBytes: file.size,
      width: dims.width,
      height: dims.height,
    });

    try {
      // Resize on the client. downscaleImage returns 1280px max JPEG q0.7.
      const ds = await downscaleImage(file);
      setResizedBytes(ds.bytes);

      setUploadPhase("uploading");
      const form = new FormData();
      form.append("photo", new File([ds.blob], "avatar.jpg", { type: "image/jpeg" }));
      const res = await riderFetch("/api/rider/me/avatar", {
        method: "POST",
        body: form,
        accessToken,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || `Upload failed (${res.status}).`);
        setUploadPhase("idle");
        return;
      }
      setMe((prev) => prev ? {
        ...prev,
        rider: { ...prev.rider, avatarUrl: json.avatarUrl ?? prev.rider.avatarUrl },
      } : prev);
      setAvatarTick((t) => t + 1);
      setUploadPhase("done");
      // Hold the success state briefly so the user can read the size delta,
      // then clear the preview to reveal the new saved avatar.
      setTimeout(() => {
        resetUpload();
      }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setUploadPhase("idle");
    }
  }

  async function onRemovePhoto() {
    if (!accessToken || removing) return;
    setRemoving(true);
    setError(null);
    try {
      const res = await riderFetch("/api/rider/me/avatar", {
        method: "DELETE",
        accessToken,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Remove failed (${res.status}).`);
        return;
      }
      setMe((prev) => prev ? {
        ...prev,
        rider: { ...prev.rider, avatarUrl: null },
      } : prev);
      setAvatarTick((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed.");
    } finally {
      setRemoving(false);
    }
  }

  const r = me?.rider;
  const isWorking = uploadPhase === "resizing" || uploadPhase === "uploading";

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
        <div style={{ position: "relative", flexShrink: 0 }}>
          {/* key=avatarTick forces re-mount on upload/remove so the cached
              <img> refetches the new URL. */}
          <span key={avatarTick}>
            <RiderAvatar
              riderId={r?.id ?? session?.riderId ?? null}
              name={r?.name ?? session?.riderName ?? ""}
              size={72}
            />
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isWorking}
            aria-label="Change profile photo"
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "var(--color-brand)",
              color: "#fff",
              border: "2px solid var(--bg-elevated)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: isWorking ? "wait" : "pointer",
              opacity: isWorking ? 0.7 : 1,
            }}
          >
            <Camera size={14} aria-hidden />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPickPhoto}
            hidden
            aria-hidden
          />
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
          {r?.avatarUrl && !preview && (
            <button
              type="button"
              onClick={onRemovePhoto}
              disabled={removing}
              style={{
                marginTop: 8,
                padding: "4px 8px",
                background: "transparent",
                border: "none",
                color: "var(--color-danger)",
                fontSize: 12,
                fontWeight: 600,
                cursor: removing ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Trash2 size={12} aria-hidden /> Remove photo
            </button>
          )}
        </div>
      </div>

      {preview && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.url}
            alt="Selected photo preview"
            width={72}
            height={72}
            style={{
              width: 72,
              height: 72,
              borderRadius: 10,
              objectFit: "cover",
              background: "var(--color-bg-hover)",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700 }}>
              {isWorking && (
                <Loader2
                  size={16}
                  aria-hidden
                  className="dropify-spin"
                  style={{ color: "var(--color-brand)" }}
                />
              )}
              <span>
                {uploadPhase === "resizing" && "Resizing photo…"}
                {uploadPhase === "uploading" && "Uploading…"}
                {uploadPhase === "done" && "Photo updated"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
              {preview.width > 0 && preview.height > 0 && (
                <span>{preview.width}×{preview.height} · </span>
              )}
              <span>{formatBytes(preview.originalBytes)}</span>
              {resizedBytes !== null && resizedBytes !== preview.originalBytes && (
                <>
                  <span style={{ color: "var(--color-text-secondary)" }}> → </span>
                  <span style={{ color: "var(--color-success)", fontWeight: 600 }}>
                    {formatBytes(resizedBytes)}
                  </span>
                </>
              )}
            </div>
            {uploadPhase === "done" && (
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                Saved. Showing the new avatar below.
              </div>
            )}
          </div>
          {uploadPhase !== "done" && !isWorking && (
            <button
              type="button"
              onClick={resetUpload}
              aria-label="Cancel upload"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--color-bg-hover)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <X size={16} aria-hidden />
            </button>
          )}
        </div>
      )}

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