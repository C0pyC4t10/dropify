"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Wallet, FileText } from "lucide-react";
import { ExpensesView } from "@/app/finance/expenses-view";
import { CashView } from "@/app/finance/cash-view";

type FinanceTab = "expenses" | "cash";

/**
 * Finance — operator hub for daily money: write expenses during a shift,
 * then read the day's P&L at the end. COD reconciliation stays under
 * /admin/cod (admin-gated review tool) — see admin/finance-overview for
 * the back-office audit surface.
 *
 * Two tabs:
 *   • Expenses     — per-company expense CRUD + summary (was /expenses).
 *   • Cash / P&L   — revenue / rider cost / expenses / net over a date
 *                    range (new). Default shows "Today".
 *
 * Tab state lives in ?tab=cash so reload + sharing keeps the same view.
 */
export default function FinancePage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: FinanceTab = params.get("tab") === "cash" ? "cash" : "expenses";

  const switchTab = (next: FinanceTab) => {
    const sp = new URLSearchParams();
    if (next !== "expenses") sp.set("tab", next);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <>
      <FinanceTabs tab={tab} onChange={switchTab} pathname={pathname} />
      {tab === "cash" ? <CashView /> : <ExpensesView />}
    </>
  );
}

function FinanceTabs({
  tab,
  onChange,
  pathname,
}: {
  tab: FinanceTab;
  onChange: (next: FinanceTab) => void;
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
        Finance
      </h1>

      <TabButton
        href={`${pathname}`}
        active={tab === "expenses"}
        icon={<Wallet size={14} />}
        label="Expenses"
        onClick={(e) => {
          e.preventDefault();
          onChange("expenses");
        }}
      />
      <TabButton
        href={`${pathname}?tab=cash`}
        active={tab === "cash"}
        icon={<FileText size={14} />}
        label="Cash / P&L"
        onClick={(e) => {
          e.preventDefault();
          onChange("cash");
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
