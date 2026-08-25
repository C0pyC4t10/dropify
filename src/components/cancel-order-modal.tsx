"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";

const REASONS: Array<{ key: string; label: string }> = [
  { key: "customer-no-answer", label: "Customer not answering phone" },
  { key: "customer-cancel", label: "Customer cancelled" },
  { key: "wrong-address", label: "Wrong / incomplete address" },
  { key: "out-of-stock", label: "Item out of stock" },
  { key: "duplicate", label: "Duplicate order" },
  { key: "price-issue", label: "Price / payment issue" },
  { key: "delivery-area", label: "Outside delivery area" },
  { key: "other", label: "Other (specify below)" },
];

interface Props {
  open: boolean;
  orderNo: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function CancelOrderModal({ open, orderNo, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const reasonLabel = REASONS.find((r) => r.key === selected)?.label || "";
  const finalReason = selected === "other" ? note.trim() : note.trim() ? `${reasonLabel} — ${note.trim()}` : reasonLabel;

  const submit = async () => {
    if (!finalReason) return;
    setBusy(true);
    try {
      await onConfirm(finalReason);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
    >
      <div className="modal-content" style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={18} color="var(--accent-red)" />
            <h2 id="cancel-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Cancel {orderNo}?
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              borderRadius: 6,
              padding: 6,
              cursor: busy ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={14} />
          </button>
        </div>

        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-secondary)" }}>
          This will restore the stock for this order and mark it as cancelled. Pick a reason so we can track why.
        </p>

        <label style={{ marginBottom: 6 }}>Reason</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
          {REASONS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setSelected(r.key)}
              disabled={busy}
              className="btn"
              style={{
                justifyContent: "flex-start",
                fontSize: 12,
                padding: "8px 10px",
                background:
                  selected === r.key ? "rgba(226, 59, 46, 0.15)" : "var(--bg-primary)",
                color:
                  selected === r.key ? "var(--accent-red)" : "var(--text-primary)",
                border: `1px solid ${
                  selected === r.key ? "rgba(226,59,46,0.4)" : "var(--border)"
                }`,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        <label style={{ marginBottom: 6 }}>
          {selected === "other" ? "Describe the reason" : "Additional note (optional)"}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
          rows={3}
          placeholder={
            selected === "other"
              ? "Type the reason for cancellation…"
              : "Anything else worth noting…"
          }
          style={{ resize: "vertical", marginBottom: 16 }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn btn-secondary"
          >
            Keep order
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !finalReason}
            className="btn btn-danger"
            title={!finalReason ? "Pick or type a reason first" : ""}
          >
            {busy ? "Cancelling…" : "Cancel order"}
          </button>
        </div>
      </div>
    </div>
  );
}