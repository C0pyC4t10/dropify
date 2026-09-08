"use client";

import type { OrderStatus } from "@/lib/types";
import { STATUS_LABELS, STATUS_FLOW } from "@/lib/ui";
import { Check, Lock, Undo2 } from "lucide-react";

interface Props {
  status: OrderStatus;
  onChange: (s: OrderStatus) => void;
  onRequestCancel?: () => void;
  onRequestReturn?: () => void;
}

export function StatusStepper({ status, onChange, onRequestCancel, onRequestReturn }: Props) {
  const cancelled = status === "cancelled";
  const returned = status === "returned";
  const maxIdx = STATUS_FLOW.indexOf(status);
  const completedIdx = cancelled || returned ? -1 : maxIdx;
  const isFinal = status === "delivered";
  const isDispatched = status === "out-for-delivery";
  // Return is available once stock has been deducted — i.e. once the order
  // is out for delivery, and of course after delivered.
  const canReturn = isFinal || isDispatched;
  const isTerminal = cancelled || returned;
  // Once out-for-delivery has begun, no going back — order is committed.
  // While preparing (or earlier), previous steps remain clickable.
  const lockedFromHere = status === "out-for-delivery";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {STATUS_FLOW.map((s, i) => {
        const done = completedIdx >= i;
        const current = !isTerminal && maxIdx === i;
        // Forward-only while in-flight: cannot go back once the rider has the order.
        const isPast = !isTerminal && maxIdx > i;
        // Once delivered, lock every step (no going back).
        const locked = isTerminal || isFinal || (lockedFromHere && isPast);
        return (
          <button
            key={s}
            onClick={() => !locked && onChange(s)}
            disabled={locked}
            className="btn"
            style={{
              background: done
                ? "var(--tint-brand-18)"
                : current
                ? "var(--tint-warning-18)"
                : "var(--bg-primary)",
              color: done
                ? "var(--accent-green)"
                : current
                ? "var(--accent-amber)"
                : "var(--text-muted)",
              border: `1px solid ${
                done
                  ? "color-mix(in srgb, var(--color-brand) 40%, transparent)"
                  : current
                  ? "color-mix(in srgb, var(--color-warning) 40%, transparent)"
                  : "var(--border)"
              }`,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 4,
              cursor: locked ? "not-allowed" : "pointer",
              opacity: locked ? 0.55 : 1,
            }}
            title={
              isTerminal
                ? `Order is ${STATUS_LABELS[status]} — status is locked`
                : isFinal
                ? "Order is delivered — status is locked"
                : lockedFromHere && isPast
                ? "Order is out for delivery — cannot revert to earlier step"
                : `Set status to ${STATUS_LABELS[s]}`
            }
          >
            {locked && isPast ? <Lock size={12} /> : done && <Check size={12} />}
            {STATUS_LABELS[s]}
          </button>
        );
      })}
      <button
        onClick={() => {
          if (isTerminal) return;
          if (onRequestCancel) onRequestCancel();
          else onChange("cancelled");
        }}
        disabled={isTerminal}
        className="btn btn-danger"
        style={{ fontSize: 12, marginLeft: 4, cursor: isTerminal ? "not-allowed" : "pointer", opacity: isTerminal ? 0.55 : 1 }}
        title={
          returned
            ? "Cannot cancel a returned order"
            : cancelled
            ? "Order is already cancelled"
            : isFinal
            ? "Cannot cancel a delivered order"
            : "Cancel order"
        }
      >
        Cancel
      </button>
      {/* Return button — available once stock has been deducted (out-for-delivery
          and delivered). Goes through onRequestReturn so the parent can
          capture the reason. */}
      {canReturn && (
        <button
          onClick={() => {
            if (onRequestReturn) onRequestReturn();
            else onChange("returned");
          }}
          className="btn"
          style={{
            fontSize: 12,
            marginLeft: 4,
            background: "var(--tint-approval-18)",
            color: "var(--color-purple)",
            border: "1px solid var(--tint-approval-40)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
          title={
            isFinal
              ? "Mark this delivered order as returned (restores stock)"
              : "Mark this out-for-delivery order as returned mid-dispatch (restores stock)"
          }
        >
          <Undo2 size={12} />
          Return
        </button>
      )}
    </div>
  );
}