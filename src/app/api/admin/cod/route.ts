import { NextResponse, type NextRequest } from "next/server";
import { getCodReconciliation, getOverrideFlaggedOrders, todayStr } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";
import { requireAdminCookie } from "@/lib/auth/admin-cookie-gate";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireAdminCookie(request);
  if (denied) return denied;
  const companyId = await getCompanyIdFromRequest(request);
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || todayStr();

  const [rows, overrides] = [
    getCodReconciliation(date, companyId),
    getOverrideFlaggedOrders(date, companyId).filter((o) => o.paymentMethod === "cod"),
  ];

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

  return NextResponse.json({
    ok: true,
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
  });
}