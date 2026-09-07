"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  Bike,
  Users,
  Settings,
  Beef,
  Truck,
  FileText,
  Sun,
  Moon,
  Menu,
  X,
  Map,
  Wallet,
  Building2,
  ChevronDown,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useActiveCompany } from "@/lib/active-company";

// Live wall-clock widget — renders a placeholder on first paint to avoid
// hydration mismatch (server has no clock), then ticks every second once
// mounted. Designed to feel like an ops console readout: blink colons,
// per-second progress ring, scan-in glow.
function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const tick = () => setNow(new Date());
    // Align first interval to the next second boundary so the display
    // changes at clean :00 ticks rather than mid-second.
    const msToNextSecond = 1000 - (Date.now() % 1000);
    const alignTimer = setTimeout(() => {
      tick();
      setInterval(tick, 1000);
    }, msToNextSecond);
    return () => clearTimeout(alignTimer);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");

  // Format UTC offset like "UTC+6" or "UTC-5:30"
  const tzOffset = (() => {
    const off = -new Date().getTimezoneOffset();
    const sign = off >= 0 ? "+" : "-";
    const abs = Math.abs(off);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${pad(m)}`;
  })();

  if (!now) {
    return (
      <div className="live-clock live-clock--placeholder" aria-hidden="true">
        <span className="live-clock__ring">
          <span className="live-clock__dot" />
        </span>
        <div className="live-clock__text">
          <div className="live-clock__time">
            <span>--</span>
            <span className="live-clock__colon">:</span>
            <span>--</span>
            <span className="live-clock__colon live-clock__colon--dim">:</span>
            <span className="live-clock__sec">--</span>
          </div>
          <div className="live-clock__date">
            <span>— —</span>
            <span className="live-clock__sep">·</span>
            <span className="live-clock__tz">{tzOffset}</span>
          </div>
        </div>
        <span className="live-clock__live">LIVE</span>
      </div>
    );
  }

  // 12-hour clock: 0 (midnight) and 12 (noon) both show as "12".
  const rawHour = now.getHours();
  const hh12 = pad(((rawHour + 11) % 12) + 1);
  const ampm = rawHour < 12 ? "AM" : "PM";
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const date = now.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  // Sweep progress (0..1) for the second hand arc around the dot
  const sweepDeg = (now.getMilliseconds() / 1000) * 360;

  return (
    <div className="live-clock" aria-label={`Current time ${hh12}:${mm}:${ss} ${ampm}, ${date}`}>
      <span
        className="live-clock__ring"
        style={{ "--sweep": `${sweepDeg}deg` } as React.CSSProperties}
      >
        <span className="live-clock__dot" />
      </span>
      <div className="live-clock__text">
        <div className="live-clock__time">
          <span className="live-clock__hhmm">{hh12}</span>
          <span className="live-clock__colon">:</span>
          <span className="live-clock__hhmm">{mm}</span>
          <span className="live-clock__colon live-clock__colon--dim">:</span>
          <span className="live-clock__sec">{ss}</span>
          <span className="live-clock__ampm">{ampm}</span>
        </div>
        <div className="live-clock__date">
          <span>{date}</span>
          <span className="live-clock__sep">·</span>
          <span className="live-clock__tz">{tzOffset}</span>
        </div>
      </div>
      <span className="live-clock__live">LIVE</span>
    </div>
  );
}

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/routes", label: "Routes", icon: Map },
  { href: "/stock", label: "Stock", icon: Package },
  { href: "/purchase-orders", label: "Purchase Orders", icon: FileText },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/expenses", label: "Expenses", icon: Wallet },
  { href: "/riders", label: "Riders", icon: Bike },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Header({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { activeCompany, companies, setActiveCompanyId } = useActiveCompany();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  // Close the drawer whenever the route changes so it doesn't linger.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Update document.title so the browser tab reflects the active company.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (activeCompany) {
      document.title = `${activeCompany.name} — Ops`;
    } else {
      document.title = "Delivery Ops";
    }
  }, [activeCompany]);

  const headerStyle: React.CSSProperties = {
    borderBottom: "1px solid var(--border)",
    background: "rgba(22, 28, 23, 0.78)",
    backdropFilter: "blur(12px) saturate(140%)",
    WebkitBackdropFilter: "blur(12px) saturate(140%)",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.18), 0 1px 2px rgba(0, 0, 0, 0.08)",
    padding: "0 16px",
    height: "52px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    boxSizing: "border-box",
    zIndex: 30,
  };

  // Fallback while /api/companies loads — show generic wordmark.
  const companyName = activeCompany?.name ?? "Delivery Ops";

  return (
    <>
      <header className={`permanent-header ${className}`.trim()} style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link
            href="/"
            style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
          >
            {activeCompany?.slug === "meat" ? (
              <Beef size={20} color="var(--accent-red)" />
            ) : (
              <Building2 size={20} color="var(--accent-green)" />
            )}
            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>
              {companyName}
            </span>
          </Link>

          {companies.length > 1 && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setSwitcherOpen((s) => !s)}
                title="Switch company"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  borderRadius: 6,
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                Switch
                <ChevronDown
                  size={12}
                  style={{ transform: switcherOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }}
                />
              </button>
              {switcherOpen && (
                <>
                  <div
                    onClick={() => setSwitcherOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 40 }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      minWidth: 220,
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
                      zIndex: 50,
                      padding: 4,
                    }}
                  >
                    {companies.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSwitcherOpen(false);
                          setActiveCompanyId(c.id);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          border: "none",
                          background:
                            c.id === activeCompany?.id ? "rgba(77,158,71,0.18)" : "transparent",
                          color: "var(--text-primary)",
                          fontSize: 13,
                          borderRadius: 6,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        <div style={{ fontWeight: c.id === activeCompany?.id ? 600 : 500 }}>{c.name}</div>
                        {c.tagline && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                            {c.tagline}
                          </div>
                        )}
                      </button>
                    ))}
                    <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                    <Link
                      href="/companies"
                      onClick={() => setSwitcherOpen(false)}
                      style={{
                        display: "block",
                        padding: "8px 10px",
                        color: "var(--text-secondary)",
                        textDecoration: "none",
                        fontSize: 12,
                        borderRadius: 6,
                      }}
                    >
                      Manage companies…
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="nav-desktop" style={{ marginLeft: 16, display: "flex", alignItems: "center" }}>
          <LiveClock />
        </div>

        <nav className="nav-desktop" style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: active ? "var(--accent-green)" : "var(--text-secondary)",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: active ? "rgba(77, 158, 71, 0.12)" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                <Icon size={16} />
                <span className="no-print">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={toggle}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              marginLeft: 8,
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              borderRadius: 6,
              padding: "6px 8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </nav>

        <div className="show-mobile-only" style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button
            onClick={toggle}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              borderRadius: 6,
              padding: "6px 8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            className="nav-mobile-toggle"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              borderRadius: 6,
              padding: "6px 8px",
              cursor: "pointer",
              display: "none",
              alignItems: "center",
            }}
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      {drawerOpen && (
        <>
          <div className="nav-drawer-overlay" onClick={() => setDrawerOpen(false)} />
          <aside className="nav-drawer">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{companyName}</span>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  borderRadius: 6,
                  padding: 6,
                  cursor: "pointer",
                  display: "flex",
                }}
              >
                <X size={16} />
              </button>
            </div>
            {NAV.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
            {companies.length > 1 && (
              <Link href="/companies">
                <Building2 size={18} />
                Switch company
              </Link>
            )}
          </aside>
        </>
      )}
    </>
  );
}