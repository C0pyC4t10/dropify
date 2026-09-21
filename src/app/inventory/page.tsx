"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Package, FileText, Truck } from "lucide-react";
import { StockView } from "@/app/inventory/stock-view";
import { PurchaseOrdersView } from "@/app/inventory/purchase-orders-view";
import { SuppliersView } from "@/app/inventory/suppliers-view";

type InventoryTab = "stock" | "purchase-orders" | "suppliers";

/**
 * Inventory — operator hub for everything about what's on hand and how it
 * got there. Three tabs:
 *   • Stock         — current inventory of every product, with movement
 *                      log + adjustment modal (formerly /stock).
 *   • Purchase Orders  — supplier POs in flight + history (formerly
 *                      /purchase-orders).
 *   • Suppliers     — supplier roster + contact info (formerly
 *                      /suppliers).
 *
 * Tab state lives in ?tab=<x>; default tab is Stock — it's the operator's
 * primary concern during a delivery shift (is the wagyu sold out?).
 */
export default function InventoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: InventoryTab =
    raw === "purchase-orders" || raw === "suppliers" ? raw : "stock";

  const switchTab = (next: InventoryTab) => {
    const sp = new URLSearchParams();
    if (next !== "stock") sp.set("tab", next);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <>
      <InventoryTabs tab={tab} onChange={switchTab} pathname={pathname} />
      {tab === "purchase-orders" ? (
        <PurchaseOrdersView />
      ) : tab === "suppliers" ? (
        <SuppliersView />
      ) : (
        <StockView />
      )}
    </>
  );
}

function InventoryTabs({
  tab,
  onChange,
  pathname,
}: {
  tab: InventoryTab;
  onChange: (next: InventoryTab) => void;
  pathname: string;
}) {
  const TABS_HEIGHT = 44;
  return (
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
        Inventory
      </h1>

      <TabButton
        href={`${pathname}`}
        active={tab === "stock"}
        icon={<Package size={14} />}
        label="Stock"
        onClick={(e) => {
          e.preventDefault();
          onChange("stock");
        }}
      />
      <TabButton
        href={`${pathname}?tab=purchase-orders`}
        active={tab === "purchase-orders"}
        icon={<FileText size={14} />}
        label="Purchase Orders"
        onClick={(e) => {
          e.preventDefault();
          onChange("purchase-orders");
        }}
      />
      <TabButton
        href={`${pathname}?tab=suppliers`}
        active={tab === "suppliers"}
        icon={<Truck size={14} />}
        label="Suppliers"
        onClick={(e) => {
          e.preventDefault();
          onChange("suppliers");
        }}
      />
    </div>
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
