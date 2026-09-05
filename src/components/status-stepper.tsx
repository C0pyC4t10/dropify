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
                ? "rgba(77, 158, 71, 0.18)"
                : current
                ? "rgba(232, 163, 61, 0.18)"
                : "var(--bg-primary)",
              color: done
                ? "var(--accent-green)"
                : current
                ? "var(--accent-amber)"
                : "var(--text-muted)",
              border: `1px solid ${
                done
                  ? "rgba(77, 158, 71, 0.4)"
                  : current
                  ? "rgba(232, 163, 61, 0.4)"
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
      {/* Return button — only available for delivered orders. Goes through
          onRequestReturn so the parent can capture the reason. */}
      {isFinal && (
        <button
          onClick={() => {
            if (onRequestReturn) onRequestReturn();
            else onChange("returned");
          }}
          className="btn"
          style={{
            fontSize: 12,
            marginLeft: 4,
            background: "rgba(139, 92, 246, 0.18)",
            color: "#a78bfa",
            border: "1px solid rgba(139, 92, 246, 0.4)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
          title="Mark this delivered order as returned (restores stock)"
        >
          <Undo2 size={12} />
          Return
        </button>
      )}
    </div>
  );
}