"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface DispatchRider {
  id: number;
  name: string;
  phone: string;
  vehicle: string;
  homeCluster: string | null;
  accountStatus: string;
}

interface DispatchOrder {
  id: number;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  area: string;
  address: string;
  riderSeq: number | null;
  status: string;
  paymentMethod: string;
  total: number;
  codDue: number;
  pod: {
    photoUploaded: boolean;
    otpVerified: boolean;
    amountCollected: number | null;
    expectedAmount: number | null;
    otpDispatchedAt: string | null;
    otpLast4: string | null;
    otpAttempts: number;
    otpExpired: boolean;
    lastTransitionReason: string;
    lastTransitionActor: string;
  } | null;
}

interface DispatchRow {
  rider: DispatchRider;
  totalDistanceMeters: number;
  pending: number;
  delivered: number;
  failed: number;
  totalCodDue: number;
  totalCodCollected: number;
  orders: DispatchOrder[];
}

interface OverrideRow {
  orderId: number;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  area: string;
  total: number;
  paymentMethod: string;
  deliveredAt: string;
  overrideReason: string;
  overrideActor: string;
  podIncomplete: boolean;
}

interface QueuedRow {
  riderId: number;
  riderName: string;
  pending: number;
}

interface DispatchPayload {
  date: string;
  companyId: number;
  board: DispatchRow[];
  overrides: OverrideRow[];
  queued: QueuedRow[];
}

const POLL_MS = 10_000;

export function DispatchBoard({ initial }: { initial: DispatchPayload }) {
  const [data, setData] = useState<DispatchPayload>(initial);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [overrideTarget, setOverrideTarget] = useState<DispatchOrder | null>(null);
  const [actingOrderId, setActingOrderId] = useState<number | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/dispatch?date=${initial.date}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.ok) {
          setData(json);
          setLastUpdated(Date.now());
        }
      }
    } catch {}
    setRefreshing(false);
  }, [initial.date]);

  useEffect(() => {
    const handle = setInterval(refresh, POLL_MS);
    return () => clearInterval(handle);
  }, [refresh]);

  /** Dispatcher-initiated OTP resend (rider has no phone / no signal / etc.). */
  const sendOtp = useCallback(
    async (orderId: number) => {
      setActingOrderId(orderId);
      setActionFeedback(null);
      try {
        const res = await fetch(`/api/admin/orders/${orderId}/send-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actorName: "dispatcher" }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setActionFeedback({ kind: "err", msg: json.error || `status ${res.status}` });
          return;
        }
        setActionFeedback({
          kind: "ok",
          msg: `OTP sent to customer ••${json.last4} — expires ${new Date(json.expiresAt).toLocaleTimeString()}`,
        });
        await refresh();
      } catch (err) {
        setActionFeedback({ kind: "err", msg: err instanceof Error ? err.message : "Failed" });
      } finally {
        setActingOrderId(null);
      }
    },
    [refresh],
  );

  /** Dispatcher advances status on behalf of a rider (e.g. the rider is on
   *  the phone with the customer and can't reach the keyboard). Routed
   *  through the existing /api/orders/[id] PUT which records the dispatcher
   *  in delivery_status_history with actorType='admin'. */
  const advance = useCallback(
    async (orderId: number, toStatus: string) => {
      setActingOrderId(orderId);
      setActionFeedback(null);
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: toStatus, actorName: "dispatcher" }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setActionFeedback({ kind: "err", msg: j.error || `status ${res.status}` });
          return;
        }
        setActionFeedback({
          kind: "ok",
          msg: `Status advanced to ${toStatus}`,
        });
        await refresh();
      } catch (err) {
        setActionFeedback({ kind: "err", msg: err instanceof Error ? err.message : "Failed" });
      } finally {
        setActingOrderId(null);
      }
    },
    [refresh],
  );


  const totalStops = data.board.reduce((s, r) => s + r.orders.length, 0);
  const totalDelivered = data.board.reduce((s, r) => s + r.delivered, 0);
  const totalFailed = data.board.reduce((s, r) => s + r.failed, 0);
  const totalCodDue = data.board.reduce((s, r) => s + r.totalCodDue, 0);
  const totalCodCollected = data.board.reduce((s, r) => s + r.totalCodCollected, 0);

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Link href="/admin" className="btn btn-secondary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 8, fontSize: 12 }}>
            <ArrowLeft size={13} /> Back to admin
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Dispatch board</h1>
          <div style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 4 }}>
            {data.date} · tenant #{data.companyId} ·{" "}
            {lastUpdated ? `updated ${formatTime(lastUpdated)}` : "loading"} {refreshing && " · refreshing…"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/cod" className="btn btn-secondary" style={{ textDecoration: "none" }}>
            COD reconciliation →
          </Link>
          <button onClick={refresh} className="btn btn-secondary">Refresh now</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
        <Tile label="Stops today" value={totalStops} />
        <Tile label="Delivered" value={totalDelivered} accent="var(--color-success)" />
        <Tile label="Failed" value={totalFailed} accent="var(--color-danger)" />
        <Tile label="COD due" value={`৳${totalCodDue.toLocaleString()}`} small />
        <Tile label="COD collected" value={`৳${totalCodCollected.toLocaleString()}`} accent="var(--color-success)" small />
      </div>

      {data.overrides.length > 0 && (
        <div style={{ ...overrideBannerStyle, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            ⚠ {data.overrides.length} admin override{data.overrides.length === 1 ? "" : "s"} need customer follow-up
          </div>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Order</th>
                <th style={th}>Customer</th>
                <th style={th}>Area</th>
                <th style={th}>Total</th>
                <th style={th}>Override</th>
                <th style={th}>POD</th>
              </tr>
            </thead>
            <tbody>
              {data.overrides.map((o) => (
                <tr key={o.orderId} style={{ background: o.podIncomplete ? "rgba(255,0,0,0.04)" : "transparent" }}>
                  <td style={td}><Link href={`/orders/${o.orderId}`} style={linkStyle}>{o.orderNo}</Link></td>
                  <td style={td}>{o.customerName}<br /><span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{o.customerPhone}</span></td>
                  <td style={td}>{o.area}</td>
                  <td style={td}>৳{o.total.toLocaleString()}</td>
                  <td style={td}>
                    <div style={{ fontSize: 12 }}>{o.overrideReason}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>by {o.overrideActor}</div>
                  </td>
                  <td style={td}>{o.podIncomplete ? <span style={{ color: "var(--color-danger)", fontWeight: 700 }}>Incomplete</span> : <span style={{ color: "var(--color-success)" }}>OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.queued.length > 0 && (
        <div style={queueBannerStyle}>
          <strong>{data.queued.length}</strong> rider{data.queued.length === 1 ? "" : "s"} with pending offline updates:{" "}
          {data.queued.map((q, i) => (
            <span key={q.riderId}>
              {i > 0 && ", "}
              {q.riderName} <span style={{ opacity: 0.7 }}>({q.pending})</span>
            </span>
          ))}
        </div>
      )}

      {actionFeedback && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background:
              actionFeedback.kind === "ok"
                ? "var(--tint-success-18)"
                : "var(--tint-danger-18)",
            color:
              actionFeedback.kind === "ok"
                ? "var(--color-success)"
                : "var(--color-danger)",
            fontSize: 13,
            marginBottom: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{actionFeedback.msg}</span>
          <button
            onClick={() => setActionFeedback(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {data.board.map((row) => (
          <RiderColumn
            key={row.rider.id}
            row={row}
            onOverrideOrder={setOverrideTarget}
            onSendOtp={sendOtp}
            onAdvance={advance}
            actingOrderId={actingOrderId}
          />
        ))}
        {data.board.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>
            No riders with assignments today.
          </div>
        )}
      </div>

      {overrideTarget && (
        <OverrideModal
          order={overrideTarget}
          onClose={() => setOverrideTarget(null)}
          onDone={() => {
            setOverrideTarget(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function RiderColumn({
  row,
  onOverrideOrder,
  onSendOtp,
  onAdvance,
  actingOrderId,
}: {
  row: DispatchRow;
  onOverrideOrder: (o: DispatchOrder) => void;
  onSendOtp: (orderId: number) => void;
  onAdvance: (orderId: number, toStatus: string) => void;
  actingOrderId: number | null;
}) {
  return (
    <div style={columnStyle}>
      <div style={columnHeaderStyle}>
        <div>
          <div style={{ fontWeight: 700 }}>{row.rider.name}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            {row.rider.vehicle} · {row.rider.homeCluster ?? "no cluster"}
            {row.rider.accountStatus !== "active" && (
              <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, background: "var(--color-warning)", color: "#fff", fontSize: 10, fontWeight: 700 }}>
                {row.rider.accountStatus}
              </span>
            )}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", textAlign: "right" }}>
          {row.delivered}/{row.orders.length}
          {row.totalCodDue > 0 && (
            <div style={{ fontWeight: 600, color: "var(--color-text)" }}>
              ৳{row.totalCodCollected.toLocaleString()} / ৳{row.totalCodDue.toLocaleString()}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8 }}>
        {row.orders.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            onOverride={() => onOverrideOrder(o)}
            onSendOtp={() => onSendOtp(o.id)}
            onAdvance={(toStatus) => onAdvance(o.id, toStatus)}
            isActing={actingOrderId === o.id}
          />
        ))}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  onOverride,
  onSendOtp,
  onAdvance,
  isActing,
}: {
  order: DispatchOrder;
  onOverride: () => void;
  onSendOtp: () => void;
  onAdvance: (toStatus: string) => void;
  isActing: boolean;
}) {
  const isDelivered = order.status === "delivered";
  const isFailed = order.status === "cancelled" || order.status === "returned";
  const isOutForDelivery = order.status === "out-for-delivery";
  const accent = isDelivered
    ? "var(--color-success)"
    : isFailed
    ? "var(--color-danger)"
    : isOutForDelivery
    ? "var(--color-brand)"
    : "var(--color-info)";

  const override = order.pod?.lastTransitionReason?.startsWith("admin_override_pod_bypass");
  const otpSkipped = order.pod?.lastTransitionReason?.includes("admin_override_pod_bypass") || (!order.pod?.otpVerified && order.status === "delivered");

  const otpSent = order.pod?.otpDispatchedAt;
  const otpExpired = order.pod?.otpExpired;
  const otpActive = !!otpSent && !otpExpired && !order.pod?.otpVerified;

  // Next legal status transition on the dispatcher's behalf.
  const nextStatus: string | null =
    order.status === "confirmed" ? "preparing"
    : order.status === "preparing" ? "out-for-delivery"
    : null;

  return (
    <div style={{ ...cardStyle, borderLeft: `3px solid ${accent}`, opacity: isDelivered ? 0.85 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {order.riderSeq && <span style={seqBadgeStyle}>{order.riderSeq}</span>}
            <div style={{ fontWeight: 600, fontSize: 13 }}>{order.customerName}</div>
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
            {order.area}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{order.orderNo}</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 11, flexShrink: 0 }}>
          <div style={{ fontWeight: 600 }}>৳{order.total.toLocaleString()}</div>
          {order.paymentMethod === "cod" && (
            <div style={{ color: "var(--color-warning)" }}>৳{order.codDue.toLocaleString()} COD</div>
          )}
        </div>
      </div>

      {otpSent && (
        <div
          style={{
            fontSize: 11,
            marginTop: 6,
            padding: "4px 6px",
            borderRadius: 6,
            background: otpExpired
              ? "var(--tint-warning-18)"
              : otpActive
                ? "var(--tint-info-12)"
                : "var(--tint-success-18)",
            color: otpExpired
              ? "#8a6d00"
              : otpActive
                ? "var(--color-info)"
                : "var(--color-success)",
          }}
          title={otpSent}
        >
          OTP sent ••{order.pod?.otpLast4} ·{" "}
          {new Date(otpSent).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          {otpExpired ? " (expired)" : otpActive ? " (active)" : " (verified)"}
          {order.pod && order.pod.otpAttempts > 0 && (
            <span style={{ marginLeft: 6, opacity: 0.7 }}>{order.pod.otpAttempts} attempt{order.pod.otpAttempts === 1 ? "" : "s"}</span>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 4, marginTop: 6, fontSize: 10, flexWrap: "wrap" }}>
        {order.pod?.photoUploaded
          ? <Pill color="var(--color-success)" text="📷" />
          : <Pill color="var(--color-text-muted)" text="no photo" />}
        {order.pod?.otpVerified
          ? <Pill color="var(--color-success)" text="OTP ✓" />
          : <Pill color="var(--color-text-muted)" text="no OTP" />}
        {order.paymentMethod === "cod" && order.pod?.amountCollected !== null && order.pod && (
          <Pill color="var(--color-success)" text={`COD ৳${order.pod.amountCollected.toLocaleString()}`} />
        )}
        {override && <Pill color="var(--color-warning)" text="OVERRIDE" />}
      </div>

      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
        <Link
          href={`/orders/${order.id}`}
          style={{
            ...linkStyle,
            fontSize: 12,
            padding: "6px 10px",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            background: "var(--bg-secondary)",
          }}
        >
          Open
        </Link>

        {/* Send OTP — visible whenever the order hasn't reached a terminal
            state yet (confirmed / preparing / out-for-delivery), so
            dispatchers can pre-send the code while the rider is still
            acknowledging pickup. The button is enabled even when an
            active OTP exists, so dispatchers can resend on customer
            request. Tap target is ≥44px tall for phone-friendly touch. */}
        {["confirmed", "preparing", "out-for-delivery"].includes(order.status) && (
          <button
            onClick={onSendOtp}
            disabled={isActing}
            style={{
              ...linkStyle,
              fontSize: 12,
              background: "var(--bg-secondary)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              padding: "6px 10px",
              minHeight: 44,
              cursor: isActing ? "wait" : "pointer",
              color: "var(--color-info)",
            }}
            title="Send delivery code to customer"
          >
            {isActing ? "…" : "Send OTP"}
          </button>
        )}

        {/* Advance on behalf of rider — only when a forward transition exists
            that isn't the delivered/returned terminal flow (those go through
            Override). Dispatcher name is captured in the audit row. */}
        {nextStatus && (
          <button
            onClick={() => onAdvance(nextStatus)}
            disabled={isActing}
            style={{
              ...linkStyle,
              fontSize: 12,
              background: "var(--bg-secondary)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              padding: "6px 10px",
              minHeight: 44,
              cursor: isActing ? "wait" : "pointer",
              color: "var(--color-brand)",
            }}
            title={`Mark as ${nextStatus} on rider's behalf`}
          >
            {isActing ? "…" : `→ ${nextStatus.replace("-", " ")}`}
          </button>
        )}

        {(isOutForDelivery || order.status === "preparing") && (
          <button
            onClick={onOverride}
            style={{
              ...linkStyle,
              fontSize: 12,
              background: "transparent",
              border: "1px solid var(--color-warning)",
              borderRadius: 6,
              padding: "6px 10px",
              minHeight: 44,
              cursor: "pointer",
              color: "var(--color-warning)",
            }}
          >
            Override close-out →
          </button>
        )}
      </div>

      {(isFailed || isDelivered) && otpSkipped && (
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-warning)" }}>
          OTP not verified — customer follow-up
        </div>
      )}
    </div>
  );
}

function Pill({ color, text }: { color: string; text: string }) {
  return (
    <span style={{
      padding: "1px 6px",
      borderRadius: 999,
      background: color,
      color: "#fff",
      fontWeight: 600,
      fontSize: 10,
    }}>{text}</span>
  );
}

function OverrideModal({ order, onClose, onDone }: { order: DispatchOrder; onClose: () => void; onDone: () => void }) {
  const [reasonCode, setReasonCode] = useState("customer_confirmed_verbally");
  const [reasonText, setReasonText] = useState("");
  const [notes, setNotes] = useState("");
  const [codAmount, setCodAmount] = useState<string>(order.pod?.amountCollected?.toString() ?? order.codDue.toString());
  const [actorName, setActorName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        toStatus: "delivered",
        reasonCode,
        reasonText,
        notes,
        actorName: actorName || "admin",
      };
      if (order.paymentMethod === "cod" && codAmount !== "") {
        body.codAmount = Number(codAmount);
      }
      const res = await fetch(`/api/admin/orders/${order.id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Company-Id": String(getCompanyIdFromCookie() ?? "") },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `status ${res.status}`);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSubmitting(false);
    }
  }

  return (
    <div style={modalBackdropStyle}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Override close-out</div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              {order.orderNo} · {order.customerName} · {order.area}
            </div>
          </div>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={labelStyle}>
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Reason</span>
            <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} style={inputStyle}>
              <option value="customer_confirmed_verbally">Customer confirmed verbally</option>
              <option value="rider_offline_otp_expired">Rider offline · OTP expired</option>
              <option value="address_verified_on_call">Address verified on call</option>
              <option value="duplicate_pod_upload">Duplicate POD upload</option>
              <option value="address_unreachable">Address unreachable</option>
              <option value="other">Other (write a note)</option>
            </select>
          </label>
          {reasonCode === "other" && (
            <label style={labelStyle}>
              <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Reason detail</span>
              <input value={reasonText} onChange={(e) => setReasonText(e.target.value)} style={inputStyle} maxLength={200} />
            </label>
          )}
          {order.paymentMethod === "cod" && (
            <label style={labelStyle}>
              <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>COD amount collected (৳)</span>
              <input
                type="number"
                inputMode="decimal"
                value={codAmount}
                onChange={(e) => setCodAmount(e.target.value)}
                style={inputStyle}
              />
            </label>
          )}
          <label style={labelStyle}>
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Notes (audit)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} maxLength={200} />
          </label>
          <label style={labelStyle}>
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Operator name (audit)</span>
            <input value={actorName} onChange={(e) => setActorName(e.target.value)} style={inputStyle} placeholder="Dispatch supervisor" />
          </label>
          {error && <div style={modalErrorStyle}>{error}</div>}
          <button onClick={submit} disabled={submitting} style={modalPrimaryStyle}>
            {submitting ? "Recording…" : "Mark delivered (override)"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getCompanyIdFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)active_company_id=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function Tile({ label, value, accent, small }: { label: string; value: number | string; accent?: string; small?: boolean }) {
  return (
    <div style={{ padding: 12, background: "var(--bg-card, #1d2420)", borderRadius: 10, border: "1px solid var(--border)", textAlign: "center" }}>
      <div style={{ fontSize: small ? 14 : 22, fontWeight: 700, color: accent ?? "var(--color-text)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--border)", verticalAlign: "top" };
const linkStyle: React.CSSProperties = { color: "var(--color-brand)", textDecoration: "none", fontWeight: 600 };
const overrideBannerStyle: React.CSSProperties = {
  background: "rgba(255, 200, 0, 0.08)",
  border: "1px solid var(--color-warning)",
  borderRadius: 10,
  padding: 12,
};
const queueBannerStyle: React.CSSProperties = {
  background: "var(--color-info, #e3f2fd)",
  border: "1px solid var(--color-info, #90caf9)",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 13,
  marginBottom: 12,
};
const columnStyle: React.CSSProperties = {
  background: "var(--bg-card, #1d2420)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};
const columnHeaderStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-secondary, #f8f8f6)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "start",
};
const seqBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 20,
  height: 20,
  padding: "0 4px",
  borderRadius: 999,
  background: "var(--color-brand, #1a7a3a)",
  color: "#fff",
  fontSize: 10,
  fontWeight: 700,
};
const cardStyle: React.CSSProperties = {
  background: "var(--bg-card, #1d2420)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: 8,
};
const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};
const modalStyle: React.CSSProperties = {
  background: "var(--bg-card, #1d2420)",
  borderRadius: 12,
  padding: 20,
  width: "min(90vw, 480px)",
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
};
const closeBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: 24,
  lineHeight: 1,
  cursor: "pointer",
  color: "var(--color-text-muted)",
};
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 14,
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-primary, #fafafa)",
  color: "var(--color-text, #111)",
};
const modalErrorStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  background: "var(--color-danger, #fee)",
  color: "var(--color-danger, #900)",
  fontSize: 13,
};
const modalPrimaryStyle: React.CSSProperties = {
  padding: "12px 14px",
  background: "var(--color-warning, #c08400)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};