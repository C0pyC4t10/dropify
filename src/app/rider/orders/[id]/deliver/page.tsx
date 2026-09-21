"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, useOnlineFlush } from "@/lib/rider-auth";
import { riderFetch, riderGetJson } from "@/lib/rider-api";
import {
  enqueueAction,
  flushQueue,
  listPending,
  pendingBytes,
  pendingPhotoCount,
  QUEUE_MAX_ITEMS,
} from "@/lib/rider-offline-queue";

type Step = "ack" | "on-way" | "otp" | "cod" | "delivered";
type OtpStep = "idle" | "sending" | "ready" | "verifying" | "verified" | "wrong";

interface OrderLite {
  id: number;
  status: string;
  statusLabel: string;
  paymentMethod: string;
  total: number;
  paid: number;
  codDue: number;
  customerPhone: string;
  customerName: string;
  items?: unknown[];
}

interface PodFromApi {
  photoPath?: string;
  otpVerified?: boolean;
  amountCollected?: number | null;
  expectedAmount?: number | null;
}

interface PodState {
  otpStep: OtpStep;
  otpLast4: string | null;
  /** Track wrong-attempts in client state too, so we can show "X attempts
   *  left" without an extra round-trip to /api/rider/orders/[id]. */
  otpWrongAttempts: number;
  otpMaxAttempts: number;
  amountCollected: string;
  codMismatch: number | null;
}

export default function RiderDeliverPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = Number(params?.id);
  const { accessToken, status } = useAuth();

  const [order, setOrder] = useState<OrderLite | null>(null);
  const [step, setStep] = useState<Step>("ack");
  const [pod, setPod] = useState<PodState>({
    otpStep: "idle",
    otpLast4: null,
    otpWrongAttempts: 0,
    otpMaxAttempts: 5,
    amountCollected: "",
    codMismatch: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [online, setOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingPhotoN, setPendingPhotoN] = useState(0);
  const [pendingBytesN, setPendingBytesN] = useState(0);

  useEffect(() => {
    if (status === "guest") router.replace("/rider/login");
  }, [status, router]);

  useEffect(() => {
    if (!accessToken || !Number.isInteger(orderId)) return;
    (async () => {
      try {
        const res = await riderGetJson<{
          order: OrderLite;
          pod: PodFromApi | null;
          otp: {
            active: boolean;
            dispatchedAt: string | null;
            expiresAt: string | null;
            attempts: number;
            maxAttempts: number;
            last4: string | null;
          } | null;
        }>(`/api/rider/orders/${orderId}`, accessToken);
        setOrder(res.order);
        // Initialize OTP step from server state, not always "idle":
        //   - pod.otpVerified already true → "verified"
        //   - active OTP row exists (dispatcher pre-sent) → "ready" so the
        //     rider sees the input field immediately instead of a 'Send
        //     code' button that would dispatch a duplicate code.
        let initialOtpStep: OtpStep = "idle";
        let initialLast4: string | null = null;
        if (res.pod?.otpVerified) {
          initialOtpStep = "verified";
        } else if (res.otp?.active) {
          initialOtpStep = "ready";
          initialLast4 = res.otp.last4 ?? null;
        }
        setPod((p) => ({
          ...p,
          otpStep: initialOtpStep,
          otpLast4: initialLast4,
          otpWrongAttempts: 0,
          otpMaxAttempts: res.otp?.maxAttempts ?? 5,
          amountCollected: res.pod?.amountCollected?.toString() ?? "",
          codMismatch:
            res.pod?.amountCollected != null && res.pod?.expectedAmount != null
              ? Math.round((res.pod.amountCollected - res.pod.expectedAmount) * 100) / 100
              : null,
        }));
        if (res.order.status === "confirmed") setStep("ack");
        else if (res.order.status === "preparing") setStep("on-way");
        else if (res.order.status === "out-for-delivery") setStep("otp");
        else router.replace(`/rider/orders/${orderId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      }
    })();
  }, [accessToken, orderId, router]);

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

  /**
   * Refresh GPS coords before any irreversible action (photo capture,
   * mark-delivered). The rider may have walked between the deliver page
   * load and the actual delivery — we want the location on file to reflect
   * where they were at the moment of action, not where they were 30 s ago
   * when the page mounted. Falls back to the last known coords on timeout
   * or permission denied; never blocks the action.
   */
  const refreshCoords = useCallback(async () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          resolve();
        },
        () => resolve(),
        { timeout: 5000, enableHighAccuracy: false, maximumAge: 1000 }
      );
    });
  }, []);

  const refreshQueue = useCallback(async () => {
    const [items, photos, bytes] = await Promise.all([
      listPending(),
      pendingPhotoCount(),
      pendingBytes(),
    ]);
    setPendingCount(items.length);
    setPendingPhotoN(photos);
    setPendingBytesN(bytes);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshQueue();
  }, [refreshQueue]);

  const flush = useCallback(async () => {
    if (!accessToken) return;
    const r = await flushQueue(accessToken);
    await refreshQueue();
    if (r.flushed > 0) {
      setError(`Synced ${r.flushed} pending update${r.flushed === 1 ? "" : "s"}${r.errors.length ? ` · ${r.errors.length} still pending` : ""}.`);
    } else if (r.errors.length > 0) {
      setError(`Sync failed for ${r.errors.length} item${r.errors.length === 1 ? "" : "s"} — they&apos;ll retry automatically.`);
    }
  }, [accessToken, refreshQueue]);

  useOnlineFlush(flush);

  async function transition(toStatus: string, reason?: string) {
    if (!accessToken) return;
    if (!online && (toStatus === "delivered" || toStatus === "returned")) {
      await refreshCoords();
      const queuedAmount =
        toStatus === "delivered" && order?.paymentMethod === "cod" && Number.isFinite(Number(pod.amountCollected))
          ? Number(pod.amountCollected)
          : null;
      const otpSkipped = toStatus === "delivered" && pod.otpStep !== "verified";
      const result = await enqueueAction({
        id: `${orderId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        orderId,
        toStatus: toStatus as "delivered" | "returned",
        reason: reason ?? "",
        lat: coords.lat,
        lng: coords.lng,
        amountCollected: queuedAmount,
        otpSkippedOffline: otpSkipped,
      });
      if (!result.ok) {
        setError(`Couldn&apos;t queue: ${result.reason ?? "queue full"}. Find signal and try again.`);
        return;
      }
      await refreshQueue();
      setError("You&apos;re offline — the COD amount and delivery status will sync when you&apos;re back online. Admin will resolve any OTP-gate hold.");
      router.replace(`/rider/orders/${orderId}`);
      return;
    }
    // Online path: refresh coords right before the irreversible actions
    // (mark-delivered especially) so the location reflects where the rider
    // actually is at the moment of action, not where they were on mount.
    if (toStatus === "delivered") {
      await refreshCoords();
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await riderFetch(`/api/rider/orders/${orderId}/transition`, {
        method: "POST",
        body: JSON.stringify({ toStatus, reason, lat: coords.lat, lng: coords.lng }),
        accessToken,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `status ${res.status}`);
      }
      const data = await res.json();
      if (toStatus === "delivered") {
        router.replace(`/rider/orders/${orderId}`);
        return;
      }
      if (toStatus === "preparing") setStep("on-way");
      else if (toStatus === "out-for-delivery") setStep("otp");
      setOrder((o) => o ? { ...o, status: data.order?.status ?? toStatus, statusLabel: data.order?.statusLabel ?? toStatus } : o);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function requestOtp() {
    if (!accessToken) return;
    setPod((p) => ({ ...p, otpStep: "sending" }));
    setError(null);
    try {
      const res = await riderFetch(`/api/rider/orders/${orderId}/pod/otp/request`, {
        method: "POST",
        body: JSON.stringify({}),
        accessToken,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `status ${res.status}`);
      }
      const json = await res.json();
      setPod((p) => ({ ...p, otpStep: "ready", otpLast4: json.last4 ?? null }));
    } catch (err) {
      setPod((p) => ({ ...p, otpStep: "idle" }));
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    }
  }

  async function verifyOtp(code: string) {
    if (!accessToken) return;
    if (!/^\d{4}$/.test(code)) {
      setError("OTP must be 4 digits.");
      return;
    }
    setPod((p) => ({ ...p, otpStep: "verifying" }));
    setError(null);
    try {
      const res = await riderFetch(`/api/rider/orders/${orderId}/pod/otp/verify`, {
        method: "POST",
        body: JSON.stringify({ code }),
        accessToken,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const reason = typeof j.reason === "string" ? j.reason : "";
        throw new Error(reason === "wrong_or_expired" ? "OTP didn't match" : (j.error || `status ${res.status}`));
      }
      setPod((p) => ({ ...p, otpStep: "verified", otpWrongAttempts: 0 }));
      if (order?.paymentMethod === "cod") {
        setStep("cod");
      } else {
        await transition("delivered");
      }
    } catch (err) {
      // Wrong attempt: bump the counter and stay on the ready/input step
      // so the rider can retry with the same code (in case they mistyped)
      // or fire a new one.
      setPod((p) => ({
        ...p,
        otpStep: "ready",
        otpWrongAttempts: p.otpWrongAttempts + 1,
      }));
      setError(err instanceof Error ? err.message : "OTP didn't match");
    }
  }

  function skipOtpOffline() {
    setPod((p) => ({ ...p, otpStep: "wrong" }));
    setError("OTP skipped because you&apos;re offline. The delivery will queue; admin can resolve the OTP gate after sync.");
    if (order?.paymentMethod === "cod") setStep("cod");
    else advanceToDeliveredOffline();
  }

  async function advanceToDeliveredOffline() {
    if (!accessToken) return;
    await refreshCoords();
    const amount = Number(pod.amountCollected);
    const queuedAmount = order?.paymentMethod === "cod" && Number.isFinite(amount) ? amount : null;
    const otpSkipped = pod.otpStep !== "verified";
    const result = await enqueueAction({
      id: `${orderId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      orderId,
      toStatus: "delivered",
      reason: "",
      lat: coords.lat,
      lng: coords.lng,
      amountCollected: queuedAmount,
      otpSkippedOffline: otpSkipped,
    });
    if (!result.ok) {
      setError(`Couldn&apos;t queue: ${result.reason ?? "queue full"}. Find signal and try again.`);
      return;
    }
    await refreshQueue();
    setError("Queued for sync. COD amount and delivery status will replay when you&apos;re back online. Admin resolves the OTP-gate on sync.");
    router.replace(`/rider/orders/${orderId}`);
  }

  async function submitCod(amount: number) {
    if (!accessToken) return;
    if (!online) {
      await advanceToDeliveredOffline();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await riderFetch(`/api/rider/orders/${orderId}/pod/cod`, {
        method: "POST",
        body: JSON.stringify({ amount }),
        accessToken,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `status ${res.status}`);
      const discrepancy = Number(json.discrepancy);
      if (json.hasMismatch && !confirm(`Collected ৳${amount} doesn&apos;t match expected ৳${json.expectedAmount}. Continue anyway?`)) {
        setSubmitting(false);
        return;
      }
      setPod((p) => ({ ...p, codMismatch: discrepancy }));
      await transition("delivered");
    } catch (err) {
      if (err instanceof TypeError) {
        await advanceToDeliveredOffline();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!order) return <main style={{ padding: 24 }}>Loading…</main>;

  const requiresCod = order.paymentMethod === "cod";
  const amountNum = Number(pod.amountCollected);
  const queueFull = pendingCount >= QUEUE_MAX_ITEMS;

  return (
    <>
      <header style={headerStyle}>
        <button onClick={() => router.push(`/rider/orders/${orderId}`)} style={backButtonStyle}>← Back</button>
        <div style={{ fontWeight: 700 }}>Delivery</div>
        <div style={{ width: 60 }} />
      </header>
      <main style={{ flex: 1, padding: "16px", maxWidth: 720, margin: "0 auto", width: "100%" }}>
        {pendingCount > 0 && (
          <div style={pendingBanner}>
            <div>
              <strong>{pendingCount}</strong> pending
              {pendingPhotoN > 0 && <> · <strong>{pendingPhotoN}</strong> photo{pendingPhotoN === 1 ? "" : "s"}</>}
              {" "}({(pendingBytesN / 1024).toFixed(0)} KB)
            </div>
            <button onClick={flush} style={syncBtn} disabled={!online}>Sync now</button>
          </div>
        )}
        {queueFull && (
          <div style={warningBox}>
            Queue is full ({QUEUE_MAX_ITEMS} items). Sync or wait until items drain before queueing more.
          </div>
        )}
        {error && <div style={errorBox}>{error}</div>}
        {!online && (
          <div style={offlineBanner}>
            You&apos;re offline. Photo capture and delivery status queue locally and sync automatically when you&apos;re back online.
          </div>
        )}

        <Stepper current={step} requiresCod={requiresCod} otpVerified={pod.otpStep === "verified"} />

        {step === "ack" && (
          <Block title="Acknowledge pickup">
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
              Confirm you&apos;ve seen this order and you&apos;re picking it up from the shop.
            </p>
            <button disabled={submitting} onClick={() => transition("preparing")} style={primaryBtn}>
              {submitting ? "Saving…" : "Got it"}
            </button>
          </Block>
        )}

        {step === "on-way" && (
          <Block title="Mark on the way">
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
              You&apos;ve picked up the order and you&apos;re heading to {order.customerName}. The customer will get a tracking link with your ETA.
            </p>
            <button disabled={submitting} onClick={() => transition("out-for-delivery")} style={primaryBtn}>
              {submitting ? "Saving…" : "On the way"}
            </button>
          </Block>
        )}

        {step === "otp" && (
          <Block title="Verify with customer">
            {online ? (
              <>
                {pod.otpStep === "idle" ? (
                  <>
                    <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
                      Send a 4-digit code to the customer. Ask for it and enter below.
                    </p>
                    <button onClick={() => void requestOtp()} style={primaryBtn}>
                      Send code
                    </button>
                  </>
                ) : pod.otpStep === "ready" || pod.otpStep === "verifying" ? (
                  <>
                    <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
                      A 4-digit code was sent to the customer. Ask for it and enter below.
                    </p>
                    {pod.otpWrongAttempts > 0 && (
                      <div style={errorBox}>
                        That didn&apos;t match ({pod.otpWrongAttempts} wrong so far).
                        {pod.otpMaxAttempts - pod.otpWrongAttempts <= 2 && (
                          <> {pod.otpMaxAttempts - pod.otpWrongAttempts} attempt{pod.otpMaxAttempts - pod.otpWrongAttempts === 1 ? "" : "s"} left before the code is invalidated.</>
                        )}
                        {" "}Re-confirm with the customer, or send a fresh code below.
                      </div>
                    )}
                    <OtpEntry
                      onSubmit={verifyOtp}
                      verifying={pod.otpStep === "verifying"}
                      key={`otp-${pod.otpWrongAttempts}`}
                    />
                    <button onClick={() => void requestOtp()} style={secondaryBtn}>
                      Resend code
                    </button>
                  </>
                ) : (
                  <>
                    <div style={successBox}>Code verified. Continue.</div>
                    <button
                      onClick={() => requiresCod ? setStep("cod") : transition("delivered")}
                      style={primaryBtn}
                    >
                      Continue
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
                  You&apos;re offline — we can&apos;t send the customer a code right now. Skip OTP and the admin can verify it later.
                </p>
                <button onClick={skipOtpOffline} style={primaryBtn}>
                  Skip OTP and continue
                </button>
              </>
            )}
          </Block>
        )}

        {step === "cod" && (
          <Block title="Collect payment">
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
              Expected: ৳{order.codDue.toLocaleString()}. Type what the customer gave you.
              {!online && " This amount queues offline and syncs with the delivery."}
            </p>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Amount collected</span>
              <input
                type="number"
                inputMode="decimal"
                value={pod.amountCollected}
                onChange={(e) => setPod((p) => ({ ...p, amountCollected: e.target.value }))}
                style={inputStyle}
              />
            </label>
            <button
              disabled={submitting || !Number.isFinite(amountNum)}
              onClick={() => submitCod(amountNum)}
              style={primaryBtn}
            >
              {submitting ? "Saving…" : online ? "Submit & mark delivered" : "Queue & mark delivered"}
            </button>
          </Block>
        )}

        {step === "delivered" && (
          <Block title="Delivered">
            <p style={{ fontSize: 14, color: "var(--color-success)", fontWeight: 600 }}>
              Order marked delivered.
            </p>
            <button onClick={() => router.replace("/rider/orders")} style={primaryBtn}>
              Back to today&apos;s list
            </button>
          </Block>
        )}
      </main>
    </>
  );
}

function OtpEntry({ onSubmit, verifying }: { onSubmit: (code: string) => void; verifying: boolean }) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Re-focus when this component mounts (key={otpWrongAttempts} on parent
    // remounts the entry on every wrong attempt so the rider can re-type
    // without first clearing the box).
    inputRef.current?.focus();
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        pattern="\d{4}"
        maxLength={4}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="Enter 4-digit code"
        style={{ ...inputStyle, fontSize: 24, letterSpacing: 8, textAlign: "center" }}
        autoFocus
      />
      <button
        disabled={verifying || code.length !== 4}
        onClick={() => onSubmit(code)}
        style={primaryBtn}
      >
        {verifying ? "Checking…" : "Verify"}
      </button>
    </div>
  );
}

function Stepper({ current, requiresCod, otpVerified }: { current: Step; requiresCod: boolean; otpVerified: boolean }) {
  const baseSteps: Array<{ key: Step; label: string }> = [
    { key: "ack", label: "Pickup" },
    { key: "on-way", label: "On the way" },
    { key: "otp", label: "OTP" },
  ];
  if (requiresCod) baseSteps.push({ key: "cod", label: "Collect" });
  baseSteps.push({ key: "delivered", label: "Done" });
  const currentIdx = baseSteps.findIndex((s) => s.key === current);
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
      {baseSteps.map((s, i) => {
        const done = i < currentIdx || (s.key === "otp" && otpVerified);
        const current2 = i === currentIdx;
        return (
          <div
            key={s.key}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: done ? "var(--color-success)" : current2 ? "var(--color-brand)" : "var(--bg-elevated, #fff)",
              color: done || current2 ? "#fff" : "var(--color-text-muted)",
              border: "1px solid var(--border)",
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {done ? "✓ " : ""}{s.label}
          </div>
        );
      })}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 16, margin: "0 0 12px", fontWeight: 700 }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 16px",
  background: "var(--bg-elevated)",
  borderBottom: "1px solid var(--color-border)",
};
const backButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: 14,
  cursor: "pointer",
  color: "var(--color-text)",
  padding: "4px 8px",
};
const cardStyle: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  padding: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)",
};
const primaryBtn: React.CSSProperties = {
  padding: "14px 18px",
  background: "var(--color-brand)",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  minHeight: 48,
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  background: "transparent",
  color: "var(--color-text)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 44,
};
const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 16,
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--bg-primary)",
  color: "var(--color-text)",
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
const successBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "var(--tint-success-18)",
  color: "var(--color-success)",
  fontSize: 14,
};
const warningBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "var(--tint-warning-18)",
  color: "var(--color-warning)",
  fontSize: 14,
};
const pendingBanner: React.CSSProperties = {
  background: "var(--color-warning)",
  color: "#fff",
  padding: "10px 12px",
  borderRadius: 10,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 10,
  fontSize: 14,
  gap: 10,
};
const syncBtn: React.CSSProperties = {
  padding: "5px 10px",
  background: "var(--bg-elevated)",
  color: "var(--color-warning)",
  border: "none",
  borderRadius: 6,
  fontWeight: 600,
  cursor: "pointer",
};
const offlineBanner: React.CSSProperties = {
  background: "var(--tint-warning-18)",
  color: "var(--color-warning)",
  padding: "8px 12px",
  borderRadius: 8,
  marginBottom: 10,
  fontSize: 13,
};