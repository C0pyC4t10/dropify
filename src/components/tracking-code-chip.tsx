"use client";

import { useState } from "react";

export function TrackingCodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  const url = typeof window !== "undefined" ? `${window.location.origin}/track/${code}` : `/track/${code}`;

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginLeft: 8,
        padding: "3px 8px",
        borderRadius: 6,
        background: "var(--bg-elevated, #f1f1ef)",
        border: "1px solid var(--border)",
        fontSize: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "var(--color-text-secondary, #444)",
      }}
      title={url}
    >
      <span style={{ fontWeight: 600 }}>{code}</span>
      <button
        type="button"
        onClick={copy}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: 0,
          fontSize: 11,
          color: "var(--color-brand, #1a7a3a)",
          fontWeight: 600,
        }}
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </span>
  );
}