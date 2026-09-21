"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bike, Map as MapIcon } from "lucide-react";
import { RoutesView } from "@/app/logistics/routes-view";
import { RidersView } from "@/app/logistics/riders-view";

type LogisticsTab = "routes" | "riders";

/**
 * Logistics — operator hub for everything that involves moving orders out
 * the door. Two tabs:
 *   • Routes  — today's planned rides + the map (formerly /routes).
 *   • Riders  — the roster of own + Pathao riders (formerly /riders).
 *
 * Tab state lives in ?tab=riders so reload + sharing keeps the same view.
 * The default tab is routes — it's the operator's primary concern during
 * a dispatch shift.
 */
export default function LogisticsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: LogisticsTab = params.get("tab") === "riders" ? "riders" : "routes";

  const switchTab = (next: LogisticsTab) => {
    const sp = new URLSearchParams();
    if (next !== "routes") sp.set("tab", next);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <>
      <LogisticsTabs tab={tab} onChange={switchTab} pathname={pathname} />
      {tab === "riders" ? <RidersView /> : <RoutesView />}
    </>
  );
}

function LogisticsTabs({
  tab,
  onChange,
  pathname,
}: {
  tab: LogisticsTab;
  onChange: (next: LogisticsTab) => void;
  pathname: string;
}) {
  // Sticky just under the global header — the header is 52px tall.
  const TABS_HEIGHT = 44;
  return (
    <>
      <div
        style={{
          position: "sticky",
          top: 52,
          zIndex: 20,
          background: "var(--bg-primary)",
          borderBottom: "1px solid var(--color-border, var(--border))",
          padding: "0 16px",
          display: "flex",
          gap: 6,
          alignItems: "center",
          height: TABS_HEIGHT,
        }}
      >
        <h1
          style={{
            fontSize: 14,
            fontWeight: 700,
            margin: 0,
            marginRight: 12,
            color: "var(--text-primary)",
          }}
        >
          Logistics
        </h1>

        <TabButton
          href={`${pathname}`}
          active={tab === "routes"}
          icon={<MapIcon size={14} />}
          label="Routes"
          onClick={(e) => {
            e.preventDefault();
            onChange("routes");
          }}
        />
        <TabButton
          href={`${pathname}?tab=riders`}
          active={tab === "riders"}
          icon={<Bike size={14} />}
          label="Riders"
          onClick={(e) => {
            e.preventDefault();
            onChange("riders");
          }}
        />
      </div>
      {/* Offset for the page content below the tabs. */}
      <div style={{ height: 0 }} />
    </>
  );
}

function TabButton({
  href,
  active,
  icon,
  label,
  onClick,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 6,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        textDecoration: "none",
        color: active ? "var(--color-brand, var(--accent-green))" : "var(--text-secondary)",
        background: active ? "var(--tint-brand-18, rgba(77,158,71,0.12))" : "transparent",
        border: `1px solid ${active ? "var(--color-brand, var(--accent-green))" : "transparent"}`,
        cursor: "pointer",
      }}
    >
      {icon}
      {label}
    </Link>
  );
}
