"use client";

import { useState } from "react";
import { Check, Pipette } from "lucide-react";

/**
 * Dropify accent color palette. Curated swatches that read well against
 * the platform's dark chrome (--bg-primary ≈ #0f1410). Add a swatch here
 * when a new tenant picks a color that should be discoverable to other
 * tenants — e.g. user-submitted palettes from the field become official.
 */
export const DROPIFY_ACCENT_PRESETS: Array<{
  name: string;
  hex: string;
  /** Hint shown under the swatch — keep short, no periods. */
  hint?: string;
}> = [
  { name: "Dropify Green",  hex: "var(--color-brand)", hint: "default" },
  { name: "Forest",        hex: "var(--color-success)", hint: "fresh" },
  { name: "Teal",          hex: "#14b8a6", hint: "modern" },
  { name: "Sky",           hex: "var(--color-info)", hint: "trust" },
  { name: "Indigo",        hex: "#6366f1", hint: "calm" },
  { name: "Purple",        hex: "#9333ea", hint: "luxury" },
  { name: "Pink",          hex: "#ec4899", hint: "fashion" },
  { name: "Crimson",       hex: "var(--color-danger)", hint: "bold" },
  { name: "Orange",        hex: "#ea580c", hint: "warm" },
  { name: "Amber",         hex: "var(--color-warning)", hint: "energy" },
  { name: "Lime",          hex: "#84cc16", hint: "organic" },
  { name: "Slate",         hex: "#64748b", hint: "neutral" },
];

/** Normalize a user-typed color string to #RRGGBB (or null if invalid). */
export function normalizeHex(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const withHash = v.startsWith("#") ? v : `#${v}`;
  // Accept #RGB or #RRGGBB
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const r = withHash[1];
    const g = withHash[2];
    const b = withHash[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    return withHash.toLowerCase();
  }
  return null;
}

interface ColorPaletteProps {
  value: string;
  onChange: (hex: string) => void;
  /** Show a free-form hex input alongside the swatches (default true). */
  showCustom?: boolean;
}

/**
 * The accent-color picker. Renders the curated Dropify swatch grid plus
 * (optionally) a custom-hex text input. Shows a checkmark on the swatch
 * that matches the current value (after normalization) so the operator can
 * always see what's currently applied.
 */
export function ColorPalette({
  value,
  onChange,
  showCustom = true,
}: ColorPaletteProps) {
  const current = normalizeHex(value) ?? "";
  const [customDraft, setCustomDraft] = useState<string>("");
  const [editingCustom, setEditingCustom] = useState<boolean>(false);

  const handleSwatch = (hex: string) => {
    setEditingCustom(false);
    setCustomDraft("");
    onChange(hex);
  };

  const handleCustom = (raw: string) => {
    setCustomDraft(raw);
    const n = normalizeHex(raw);
    if (n) {
      onChange(n);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        role="radiogroup"
        aria-label="Accent color preset"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 6,
        }}
      >
        {DROPIFY_ACCENT_PRESETS.map((s) => {
          const active = current === s.hex.toLowerCase();
          return (
            <button
              key={s.hex}
              type="button"
              role="radio"
              aria-checked={active}
              title={`${s.name} (${s.hex})${s.hint ? " \u2014 " + s.hint : ""}`}
              onClick={() => handleSwatch(s.hex)}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: 6,
                borderRadius: 8,
                border: `1px solid ${
                  active ? s.hex : "var(--border)"
                }`,
                background: active ? `${s.hex}22` : "var(--bg-primary)",
                cursor: "pointer",
                transition: "transform 0.12s, border-color 0.12s, background 0.12s",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                  (e.currentTarget as HTMLElement).style.borderColor = `${s.hex}66`;
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.transform = "";
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                }
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: 28,
                  borderRadius: 6,
                  background: s.hex,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: active
                    ? `0 0 0 2px ${s.hex}55, inset 0 0 0 1px rgba(255,255,255,0.2)`
                    : "inset 0 0 0 1px rgba(255,255,255,0.06)",
                }}
              >
                {active && <Check size={14} color="#fff" strokeWidth={3} />}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  lineHeight: 1.1,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  width: "100%",
                }}
              >
                {s.name}
              </div>
            </button>
          );
        })}
      </div>

      {showCustom && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Pipette size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            value={editingCustom ? customDraft : (value ?? "")}
            placeholder="Custom hex \u2014 e.g. #7c3aed"
            onFocus={() => {
              setEditingCustom(true);
              setCustomDraft(value || "");
            }}
            onChange={(e) => handleCustom(e.target.value)}
            onBlur={() => {
              // If user typed something but it didn't normalize, restore.
              if (customDraft && !normalizeHex(customDraft)) {
                setCustomDraft("");
                setEditingCustom(false);
              }
            }}
            style={{
              flex: 1,
              fontFamily: "monospace",
              fontSize: 12,
            }}
          />
          <div
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: current
                ? `linear-gradient(135deg, ${current} 0%, ${current}dd 100%)`
                : "transparent",
              flexShrink: 0,
            }}
            title={current || "no color set"}
          />
        </div>
      )}
    </div>
  );
}
