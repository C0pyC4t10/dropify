"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  UserCheck,
  CheckCircle2,
  XCircle,
  Clock,
  ShoppingBag,
  X,
} from "lucide-react";
import { formatMoney } from "@/lib/ui";
import { normalizePhone } from "@/lib/phone";

export interface CustomerMatchStats {
  total: number;
  delivered: number;
  cancelled: number;
  inProgress: number;
  lifetimeSpend: number;
}

export interface CustomerMatch {
  id: number;
  name: string;
  phone: string;
  area: string;
  address: string;
  stats: CustomerMatchStats;
}

interface Props {
  /** Phone (any format) to look up. The component normalizes + debounces. */
  phone: string;
  /** When provided, the user can click "Use this customer" to load all fields. */
  onUse?: (match: CustomerMatch) => void;
  /** Render in a compact form (true) suitable for inline use next to inputs. */
  compact?: boolean;
}

/**
 * Inline panel shown while typing a phone on an order form. When the phone
 * matches an existing customer, the panel surfaces their name + order stats
 * so the dispatcher can see "how many orders this customer received / has
 * cancelled" before submitting the new order.
 */
export default function CustomerMatchBanner({ phone, onUse, compact }: Props) {
  const [match, setMatch] = useState<CustomerMatch | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setMatch(null);
    setNotFound(false);
    const normalized = normalizePhone(phone || "");
    if (!normalized) return;
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/customers?phone=${encodeURIComponent(normalized)}`
        );
        const data = await r.json();
        if (data.match) {
          setMatch(data.match as CustomerMatch);
          setNotFound(false);
        } else {
          setMatch(null);
          setNotFound(true);
        }
      } catch {
        setMatch(null);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [phone]);

  if (loading && !match) {
    return (
      <div style={shellStyle(compact, "loading")}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Checking existing customer…
        </span>
      </div>
    );
  }

  if (match) {
    if (dismissedId === match.id) return null;
    const s = match.stats;
    return (
      <div style={shellStyle(compact, "match")}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: compact ? 8 : 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <UserCheck size={14} color="var(--accent-green)" />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--accent-green)",
              }}
            >
              Existing Customer
            </span>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                padding: "1px 6px",
                borderRadius: 999,
                background: "color-mix(in srgb, var(--color-brand) 10%, transparent)",
                color: "var(--accent-green)",
                border: "1px solid color-mix(in srgb, var(--color-brand) 30%, transparent)",
                fontWeight: 600,
              }}
            >
              #{match.id}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {match.name}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              · {match.area || "no area"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Link
              href={`/customers/${match.id}`}
              target="_blank"
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                textDecoration: "underline",
              }}
            >
              View profile
            </Link>
            <button
              type="button"
              onClick={() => setDismissedId(match.id)}
              title="Dismiss"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                padding: 2,
                display: "flex",
              }}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: compact
              ? "repeat(4, minmax(0, 1fr))"
              : "repeat(4, minmax(0, 1fr))",
            gap: compact ? 6 : 8,
          }}
        >
          <StatChip
            icon={<ShoppingBag size={11} />}
            label="Total"
            value={s.total}
            color="var(--text-primary)"
            bg="var(--bg-elev, rgba(0,0,0,0.04))"
            border="var(--border)"
          />
          <StatChip
            icon={<CheckCircle2 size={11} />}
            label="Received"
            value={s.delivered}
            color="var(--accent-green)"
            bg="color-mix(in srgb, var(--color-brand) 10%, transparent)"
            border="color-mix(in srgb, var(--color-brand) 30%, transparent)"
          />
          <StatChip
            icon={<XCircle size={11} />}
            label="Cancelled"
            value={s.cancelled}
            color="var(--accent-red)"
            bg="var(--tint-danger-12)"
            border="color-mix(in srgb, var(--color-danger) 30%, transparent)"
          />
          <StatChip
            icon={<Clock size={11} />}
            label="In progress"
            value={s.inProgress}
            color="var(--accent-amber, #f0a93b)"
            bg="color-mix(in srgb, var(--color-warning) 10%, transparent)"
            border="color-mix(in srgb, var(--color-warning) 30%, transparent)"
          />
        </div>

        {!compact && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px dashed color-mix(in srgb, var(--color-brand) 30%, transparent)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Lifetime spend:{" "}
              <strong style={{ color: "var(--accent-green)" }}>
                {formatMoney(s.lifetimeSpend)}
              </strong>
            </span>
            {onUse && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onUse(match)}
                style={{ fontSize: 12, padding: "4px 12px" }}
              >
                <UserCheck size={12} /> Use this customer
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={shellStyle(compact, "new")}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          New customer — no existing record for this phone.
        </span>
      </div>
    );
  }

  return null;
}

function shellStyle(compact: boolean | undefined, kind: "match" | "new" | "loading"): React.CSSProperties {
  const padding = compact ? "8px 10px" : "10px 14px";
  if (kind === "loading") {
    return {
      padding,
      borderRadius: 8,
      border: "1px dashed var(--border)",
      background: "var(--bg-elev, rgba(0,0,0,0.02))",
      marginTop: 6,
    };
  }
  if (kind === "match") {
    return {
      padding,
      borderRadius: 8,
      border: "1px solid color-mix(in srgb, var(--color-brand) 35%, transparent)",
      background: "color-mix(in srgb, var(--color-brand) 6%, transparent)",
      marginTop: 6,
    };
  }
  return {
    padding,
    borderRadius: 8,
    border: "1px dashed var(--border)",
    background: "transparent",
    marginTop: 6,
  };
}

function StatChip({
  icon,
  label,
  value,
  color,
  bg,
  border,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  bg: string;
  border: string;
}) {
  return (
    <div
      title={`${label}: ${value}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 8px",
        borderRadius: 6,
        background: bg,
        border: `1px solid ${border}`,
        gap: 2,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 10,
          fontWeight: 600,
          color,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {icon}
        {label}
      </div>
      <div
        style={{
          fontFamily: "monospace",
          fontSize: 16,
          fontWeight: 700,
          color: "var(--text-primary)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}