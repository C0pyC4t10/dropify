"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Sun, HelpCircle, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "@/lib/rider-auth";
import { useTheme } from "@/components/theme-provider";
import { RiderTabBar } from "./rider-tab-bar";
import { RiderAvatar } from "./rider-avatar";

function DropifyMark() {
  return (
    <div
      aria-label="Dropify"
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 2,
        fontWeight: 800,
        fontSize: 16,
        letterSpacing: -0.3,
        color: "var(--color-brand)",
        flexShrink: 0,
      }}
    >
      <span>Dropify</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", marginLeft: 4 }}>
        RIDER
      </span>
    </div>
  );
}

export function RiderAppShell({
  children,
  title,
  showHeader = true,
}: {
  children: React.ReactNode;
  title?: string;
  showHeader?: boolean;
}) {
  const router = useRouter();
  const { session, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  async function onSignOut() {
    await logout();
    router.replace("/rider/login");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {showHeader && (
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            background: "var(--bg-elevated)",
            borderBottom: "1px solid var(--color-border)",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            minHeight: 56,
          }}
        >
          <DropifyMark />
          <RiderAvatar riderId={session?.riderId ?? null} name={session?.riderName ?? ""} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {session?.riderName ?? "Rider"}
            </div>
            {title ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--color-text-muted)",
                  lineHeight: 1.3,
                }}
              >
                {title}
              </div>
            ) : null}
          </div>
          <div
            aria-label={online ? "Online" : "Offline"}
            title={online ? "Online" : "Offline"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: online ? "var(--tint-success-18)" : "var(--tint-warning-18)",
              color: online ? "var(--color-success)" : "var(--color-warning)",
            }}
          >
            {online ? <Wifi size={12} aria-hidden /> : <WifiOff size={12} aria-hidden />}
            {online ? "Online" : "Offline"}
          </div>
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              aria-label="Open menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              style={{
                minWidth: 44,
                minHeight: 44,
                padding: 0,
                background: "transparent",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                color: "var(--color-text)",
                fontSize: 18,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ⋯
            </button>
            {menuOpen && (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  minWidth: 200,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  padding: 6,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <MenuItem
                  icon={theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                  label={theme === "dark" ? "Light mode" : "Dark mode"}
                  onClick={() => {
                    toggle();
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  icon={<HelpCircle size={16} />}
                  label="Help & support"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/rider/help");
                  }}
                />
                <div style={{ height: 1, background: "var(--color-border)", margin: "4px 0" }} />
                <MenuItem
                  icon={<LogOut size={16} />}
                  label="Sign out"
                  onClick={onSignOut}
                  danger
                />
              </div>
            )}
          </div>
        </header>
      )}
      <main
        style={{
          flex: 1,
          padding: "16px 16px 96px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {children}
      </main>
      {showHeader && <RiderTabBar />}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        minHeight: 44,
        background: hover ? "var(--color-bg-hover)" : "var(--bg-elevated)",
        border: "none",
        borderRadius: 8,
        textAlign: "left",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 600,
        color: danger ? "var(--color-danger)" : "var(--color-text)",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}