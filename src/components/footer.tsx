"use client";

import { Beef, Phone, Building2 } from "lucide-react";
import Link from "next/link";
import { useActiveCompany } from "@/lib/active-company";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Settings } from "@/lib/types";

interface FooterProps {
  className?: string;
}

export function Footer({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const { activeCompany, activeCompanyId } = useActiveCompany();
  const [settings, setSettings] = useState<Settings | null>(null);

  // Re-read settings whenever the active company changes.
  useEffect(() => {
    if (activeCompanyId == null) return;
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setSettings(j);
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId]);

  // Rider PWA renders its own footer-free chrome — drop the operator footer.
  if (pathname?.startsWith("/rider")) return null;
  const year = new Date().getFullYear();
  const companyName = settings?.businessName ?? activeCompany?.name ?? "Dropify";
  const phone = settings?.phone || "";
  const isMeat = activeCompany?.slug === "meat";
  const Icon = isMeat ? Beef : Building2;

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
          <Icon size={16} color="var(--color-brand)" />
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{companyName}</span>
          {activeCompany?.tagline && (
            <span style={{ color: "var(--text-muted)" }}>· {activeCompany.tagline}</span>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            color: "var(--text-muted)",
            fontSize: 12,
          }}
        >
          <span style={{ fontStyle: "italic" }}>
            The ops layer under every delivery business.
          </span>
          <Link
            href="/about"
            style={{ color: "var(--color-brand)", textDecoration: "none" }}
          >
            About Dropify
          </Link>
          {phone && (
            <a
              href={`tel:${phone}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                color: "var(--text-secondary)",
                textDecoration: "none",
              }}
            >
              <Phone size={12} /> {phone}
            </a>
          )}
        </div>

        <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
          © {year} {companyName} · All rights reserved
        </div>
      </div>
    </footer>
  );
}
