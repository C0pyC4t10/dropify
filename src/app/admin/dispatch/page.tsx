import { cookies } from "next/headers";
import {
  getDispatchBoard,
  getOverrideFlaggedOrders,
  getOfflineQueuedSummary,
  todayStr,
  DEFAULT_COMPANY_ID,
} from "@/lib/db";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/tenant-constants";
import { DispatchBoard } from "./dispatch-board";

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

export default async function DispatchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const date = params.date || todayStr();
  const companyId = await resolveCompanyId();

  const board = getDispatchBoard(date, companyId);
  const overrides = getOverrideFlaggedOrders(date, companyId);
  const queued = getOfflineQueuedSummary(date, companyId);

  const initialPayload = {
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
  };

  return <DispatchBoard initial={initialPayload} />;
}