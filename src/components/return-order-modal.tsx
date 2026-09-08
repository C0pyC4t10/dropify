"use client";

import { useState } from "react";
import { X, Undo2 } from "lucide-react";

const REASONS: Array<{ key: string; label: string }> = [
  { key: "spoiled", label: "Spoiled / off-smell" },
  { key: "wrong-item", label: "Wrong item delivered" },
  { key: "quality-issue", label: "Quality issue (cuts, fat, etc.)" },
  { key: "late-delivery", label: "Delivered too late" },
  { key: "weight-short", label: "Weight short" },
  { key: "customer-changed-mind", label: "Customer changed mind" },
  { key: "damaged-packaging", label: "Damaged packaging" },
  { key: "other", label: "Other (specify below)" },
];

interface Props {
  open: boolean;
  orderNo: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function ReturnOrderModal({ open, orderNo, onClose, onConfirm }: Props) {
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
      aria-labelledby="return-modal-title"
    >
      <div className="modal-content" style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Undo2 size={18} color="var(--color-purple)" />
            <h2 id="return-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Mark {orderNo} returned?
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
          This restores stock for the returned items (goods come back into sellable inventory) and marks the order as returned. Process any refund out of band.
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
                  selected === r.key ? "var(--tint-approval-15)" : "var(--bg-primary)",
                color:
                  selected === r.key ? "var(--color-purple)" : "var(--text-primary)",
                border: `1px solid ${
                  selected === r.key ? "var(--tint-approval-40)" : "var(--border)"
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
              ? "Type the reason for return…"
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
            className="btn"
            style={{
              background: "var(--color-purple)",
              color: "#1a0f3d",
              border: "1px solid #a78bfa",
            }}
            title={!finalReason ? "Pick or type a reason first" : ""}
          >
            {busy ? "Returning…" : "Mark returned"}
          </button>
        </div>
      </div>
    </div>
  );
}
