"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Clock, User } from "lucide-react";

const TABS = [
  { href: "/rider/orders",  label: "Today",   icon: Home,  match: (p: string) => p === "/rider/orders" || p.startsWith("/rider/orders/") },
  { href: "/rider/history", label: "History", icon: Clock, match: (p: string) => p.startsWith("/rider/history") },
  { href: "/rider/profile", label: "Profile", icon: User,  match: (p: string) => p.startsWith("/rider/profile") },
];

export function RiderTabBar() {
  const pathname = usePathname() || "";
  return (
    <nav
      aria-label="Rider navigation"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "var(--bg-elevated)",
        borderTop: "1px solid var(--color-border)",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "stretch",
        paddingBottom: "env(safe-area-inset-bottom, 0)",
      }}
    >
      {TABS.map((t) => {
        const active = t.match(pathname);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              minHeight: 56,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              padding: "8px 4px",
              margin: "6px 4px",
              borderRadius: 10,
              color: active ? "#fff" : "var(--color-text-muted)",
              background: active ? "var(--color-brand)" : "var(--bg-hover)",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: active ? 700 : 500,
            }}
          >
            <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}