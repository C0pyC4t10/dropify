import { NextResponse, type NextRequest } from "next/server";
import {
  getDispatchBoard,
  getOverrideFlaggedOrders,
  getOfflineQueuedSummary,
  todayStr,
} from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";
import { requireAdminCookie } from "@/lib/auth/admin-cookie-gate";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireAdminCookie(request);
  if (denied) return denied;
  const companyId = await getCompanyIdFromRequest(request);
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || todayStr();

  const [board, overrides, queued] = [
    getDispatchBoard(date, companyId),
    getOverrideFlaggedOrders(date, companyId),
    getOfflineQueuedSummary(date, companyId),
  ];

  return NextResponse.json({
    ok: true,
    date,
    companyId,
    board: board.map((row) => ({
      rider: {
        id: row.rider.id,
        name: row.rider.name,
        phone: row.rider.phone,
        vehicle: row.rider.vehicle,
        homeCluster: row.rider.homeCluster,
        accountStatus: row.rider.accountStatus,
      },
      totalDistanceMeters: row.totalDistanceMeters,
      pending: row.pending,
      delivered: row.delivered,
      failed: row.failed,
      totalCodDue: row.totalCodDue,
      totalCodCollected: row.totalCodCollected,
      orders: row.orders.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        area: o.area,
        address: o.address,
        riderSeq: o.riderSeq,
        status: o.status,
        paymentMethod: o.paymentMethod,
        total: o.total,
        codDue: o.paymentMethod === "cod" ? o.total - (o.paid || 0) : 0,
        pod: row.podByOrderId[o.id] ?? null,
      })),
    })),
    overrides: overrides.map((o) => ({
      orderId: o.orderId,
      orderNo: o.orderNo,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      area: o.area,
      total: o.total,
      paymentMethod: o.paymentMethod,
      deliveredAt: o.deliveredAt,
      overrideReason: o.overrideReason,
      overrideActor: o.overrideActor,
      podIncomplete: o.podIncomplete,
    })),
    queued,
  });
}