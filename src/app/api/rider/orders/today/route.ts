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
      if (o.status === "delivered") {
        acc.delivered += 1;
        // Cash the rider actually took from customers on delivered COD
        // orders today — used to populate the day's "COD" stat in the
        // rider history view. Was previously `codExpected = total` which
        // conflated "amount collected" with "amount owed" and read as
        // ৳0 on every day after the operator settled delivered orders.
        if (o.paymentMethod === "cod") acc.codCollected += o.paid ?? 0;
        if (o.paymentMethod === "cod") acc.codExpected += o.total;
      } else if (o.status === "cancelled" || o.status === "returned") {
        acc.failed += 1;
        // Total ticket value of orders the rider couldn't deliver —
        // visible in the day's "Failed" stat so the rider sees the cash
        // exposure from cancellations / returns, not just a count.
        acc.failedAmount += o.total;
      } else {
        acc.pending += 1;
        if (o.paymentMethod === "cod") acc.codExpected += o.total;
      }
      return acc;
    },
    {
      total: 0,
      pending: 0,
      delivered: 0,
      failed: 0,
      // What the rider actually collected today from COD customers.
      codCollected: 0,
      // The full COD face value assigned to the rider today (delivered
      // collected + still-pending). Kept for the orders-page COD
      // counter where the operator wants the gross face value.
      codExpected: 0,
      failedAmount: 0,
    },
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