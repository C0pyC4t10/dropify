"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/rider-auth";
import { RiderAppShell } from "@/components/rider/rider-app-shell";
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  HelpCircle,
  MessageCircle,
  Phone,
  RefreshCw,
} from "lucide-react";

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "An order came in — what now?",
    a: "Open it from the Today tab, acknowledge pickup, then mark on the way once you have the goods. The next steps are OTP, then COD if the order is cash on delivery.",
  },
  {
    q: "My GPS is off. Will delivery still go through?",
    a: "Yes. We&apos;ll still mark the order delivered. We just won&apos;t have the exact pin on the audit trail.",
  },
  {
    q: "The customer says they didn&apos;t get the SMS OTP.",
    a: "Tap &ldquo;Resend code&rdquo; on the OTP step. If it still doesn&apos;t arrive, call the dispatcher on this page.",
  },
  {
    q: "I&apos;m offline and the customer is paying cash.",
    a: "No problem. The flow queues the COD amount and delivery status. They sync the moment you&apos;re back online.",
  },
  {
    q: "How do I sign out?",
    a: "Tap the ⋯ in the top right of any screen, or open Profile → Sign out.",
  },
];

export default function RiderHelpPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "guest") router.replace("/rider/login");
  }, [status, router]);

  return (
    <RiderAppShell title="Help & support">
      <button
        type="button"
        onClick={() => router.back()}
        style={backBtnStyle}
        aria-label="Go back"
      >
        <ArrowLeft size={16} aria-hidden /> Back
      </button>

      <div style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: 20,
        marginBottom: 16,
      }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "var(--color-brand)",
          background: "var(--tint-brand-12)",
          padding: "4px 10px",
          borderRadius: 999,
          fontWeight: 700,
          marginBottom: 12,
        }}>
          <HelpCircle size={14} aria-hidden /> Dispatch floor
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>
          Stuck? Get a human on the line.
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 8 }}>
          The dispatcher can override OTP, refund COD, and reset your PIN.
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <a
            href="tel:+8801710327794"
            style={{ ...ctaStyle, background: "var(--color-brand)", color: "#fff", borderColor: "var(--color-brand)" }}
          >
            <Phone size={16} aria-hidden /> Call dispatcher
          </a>
          <a
            href="https://wa.me/8801710327794"
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...ctaStyle, background: "var(--bg-elevated)", color: "var(--color-text)" }}
          >
            <MessageCircle size={16} aria-hidden /> WhatsApp
          </a>
        </div>
      </div>

      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: "var(--color-text-muted)",
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginBottom: 8,
        padding: "0 4px",
      }}>
        FAQ
      </div>
      <div style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 16,
      }}>
        {FAQ.map((item, idx) => (
          <details
            key={idx}
            style={{
              borderBottom: idx === FAQ.length - 1 ? "none" : "1px solid var(--color-border)",
            }}
          >
            <summary style={{
              listStyle: "none",
              cursor: "pointer",
              padding: "14px 16px",
              minHeight: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              fontWeight: 600,
              fontSize: 14,
            }}>
              <span>{item.q}</span>
              <ChevronDown size={18} aria-hidden style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
            </summary>
            <div style={{
              padding: "0 16px 14px",
              fontSize: 13,
              color: "var(--color-text-secondary)",
              lineHeight: 1.5,
            }}>
              {item.a}
            </div>
          </details>
        ))}
      </div>

      <div id="privacy" style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: 16,
        fontSize: 13,
        color: "var(--color-text-secondary)",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}>
        <AlertCircle size={18} aria-hidden style={{ color: "var(--color-info)", flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 700, color: "var(--color-text)", marginBottom: 4 }}>Your data</div>
          <div>
            We only store what we need to run your shift — your name, phone, vehicle, the deliveries you handle, and proof-of-delivery photos. Dispatchers can see the audit trail; nothing else leaves the building.
          </div>
        </div>
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 16,
        padding: "10px 12px",
        background: "var(--tint-info-12)",
        border: "1px solid var(--tint-info-12)",
        borderRadius: 10,
        fontSize: 12,
        color: "var(--color-info)",
      }}>
        <RefreshCw size={14} aria-hidden />
        Updates roll out automatically. No need to reinstall.
      </div>
    </RiderAppShell>
  );
}

const ctaStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 10,
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
  border: "1px solid var(--color-border)",
};

const backBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 36,
  padding: "0 12px",
  background: "transparent",
  border: "none",
  color: "var(--color-text-secondary)",
  fontSize: 13,
  cursor: "pointer",
  marginBottom: 12,
};