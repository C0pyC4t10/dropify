import { cookies } from "next/headers";
import {
  getCodReconciliation,
  getOverrideFlaggedOrders,
  todayStr,
  DEFAULT_COMPANY_ID,
} from "@/lib/db";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/tenant-constants";
import { CodBoard } from "./cod-board";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

async function resolveCompanyId(): Promise<number> {
  const store = await cookies();
  const cookieVal = store.get(ACTIVE_COMPANY_COOKIE)?.value;
  if (cookieVal && /^\d+$/.test(cookieVal)) {
    const n = parseInt(cookieVal, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_COMPANY_ID;
}

export default async function CodReconciliationPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const date = params.date || todayStr();
  const companyId = await resolveCompanyId();

  const rows = getCodReconciliation(date, companyId);
  const overrides = getOverrideFlaggedOrders(date, companyId).filter((o) => o.paymentMethod === "cod");

  const totals = rows.reduce(
    (acc, r) => {
      acc.expected += r.expectedAmount;
      acc.collected += r.collectedAmount;
      acc.discrepancy += r.discrepancy;
      acc.mismatchedOrders += r.mismatchedOrders;
      acc.totalDeliveredCodOrders += r.totalDeliveredCodOrders;
      return acc;
    },
    { expected: 0, collected: 0, discrepancy: 0, mismatchedOrders: 0, totalDeliveredCodOrders: 0 }
  );

  const initialPayload = {
    date,
    companyId,
    totals,
    rows: rows.map((r) => ({
      riderId: r.riderId,
      riderName: r.riderName,
      totalDeliveredCodOrders: r.totalDeliveredCodOrders,
      expectedAmount: r.expectedAmount,
      collectedAmount: r.collectedAmount,
      discrepancy: r.discrepancy,
      mismatchedOrders: r.mismatchedOrders,
    })),
    overrides: overrides.map((o) => ({
      orderId: o.orderId,
      orderNo: o.orderNo,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      area: o.area,
      total: o.total,
      overrideActor: o.overrideActor,
      deliveredAt: o.deliveredAt,
      podIncomplete: o.podIncomplete,
    })),
  };

  return <CodBoard initial={initialPayload} />;
}