import { NextResponse, type NextRequest } from "next/server";
import {
  getRiderAssignedOrdersAcrossTenants,
  todayStr,
} from "@/lib/db";
import {
  requireRider,
  riderGuardErrorResponse,
} from "@/lib/auth/rider-guard";
import { RIDER_STATUS_LABEL } from "@/lib/rider-flow";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let guarded;
  try {
    guarded = requireRider(request, "access");
  } catch (err) {
    const r = riderGuardErrorResponse(err);
    if (r) return r;
    throw err;
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || todayStr();
  const orders = getRiderAssignedOrdersAcrossTenants(guarded.rider.id, date);

  const summary = orders.reduce(
    (acc, o) => {
      acc.total += 1;
      if (o.status === "delivered") acc.delivered += 1;
      else if (o.status === "cancelled" || o.status === "returned") acc.failed += 1;
      else acc.pending += 1;
      if (o.paymentMethod === "cod") acc.codExpected += o.total;
      return acc;
    },
    { total: 0, pending: 0, delivered: 0, failed: 0, codExpected: 0 }
  );

  return NextResponse.json({
    ok: true,
    date,
    summary,
    orders: orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      companyId: o.companyId,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      area: o.area,
      address: o.address,
      riderSeq: o.riderSeq,
      status: o.status,
      statusLabel: RIDER_STATUS_LABEL[o.status],
      paymentMethod: o.paymentMethod,
      total: o.total,
      paid: o.paid,
      codDue: o.paymentMethod === "cod" ? Math.max(0, o.total - (o.paid || 0)) : 0,
      lat: o.lat,
      lng: o.lng,
      itemCount: o.items.length,
      itemSummary: o.items
        .slice(0, 3)
        .map((it) => `${it.qty}${it.unit} ${it.name}`)
        .join(", "),
    })),
  });
}