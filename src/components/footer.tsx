"use client";

import { Beef, Phone, Mail } from "lucide-react";

interface FooterProps {
  className?: string;
}

export function Footer({ className = "" }: FooterProps) {
  const year = new Date().getFullYear();
  return (
    <footer
      className={`permanent-footer ${className}`.trim()}
      style={{
        marginTop: "auto",
        borderTop: "1px solid var(--border)",
        background: "rgba(22, 28, 23, 0.6)",
        backdropFilter: "blur(10px) saturate(140%)",
        WebkitBackdropFilter: "blur(10px) saturate(140%)",
        padding: "20px 24px",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          color: "var(--text-secondary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Beef size={16} color="var(--accent-red)" />
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Bazarey Ltd</span>
          <span style={{ color: "var(--text-muted)" }}>· Meat Delivery Ops</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <a
            href="tel:01932367356"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-secondary)", textDecoration: "none" }}
          >
            <Phone size={12} /> 01932367356
          </a>
          <a
            href="mailto:bazarey2026@gmail.com"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-secondary)", textDecoration: "none" }}
          >
            <Mail size={12} /> bazarey2026@gmail.com
          </a>
        </div>

        <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
          © {year} Bazarey Ltd · All rights reserved
        </div>
      </div>
    </footer>
  );
}
