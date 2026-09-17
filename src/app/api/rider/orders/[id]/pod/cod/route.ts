import { NextResponse, type NextRequest } from "next/server";
import {
  getRiderOrder,
  getProofOfDelivery,
  updateProofOfDelivery,
  insertProofOfDelivery,
  expectedAmountForOrder,
} from "@/lib/db";
import {
  requireRider,
  riderGuardErrorResponse,
} from "@/lib/auth/rider-guard";

export const dynamic = "force-dynamic";

function errorResponse(
  status: number,
  error: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let guarded;
  try {
    guarded = requireRider(request, "access");
  } catch (err) {
    const r = riderGuardErrorResponse(err);
    if (r) return r;
    throw err;
  }

  const { id: idParam } = await params;
  const orderId = Number(idParam);
  if (!Number.isInteger(orderId)) {
    return errorResponse(400, "Invalid order id.");
  }

  const order = getRiderOrder(guarded.rider.id, orderId);
  if (!order) {
    return errorResponse(404, "Order not found.");
  }
  if (order.paymentMethod !== "cod") {
    return errorResponse(400, "Order is not COD — no amount to collect.", {
      reason: "not_cod",
    });
  }

  let body: { amount?: number };
  try {
    body = (await request.json()) as { amount?: number };
  } catch {
    return errorResponse(400, "Invalid JSON body.");
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return errorResponse(400, "Amount must be a non-negative number.");
  }
  const expected = expectedAmountForOrder(order);

  let pod = getProofOfDelivery(orderId);
  if (!pod) {
    pod = insertProofOfDelivery({
      orderId,
      photoPath: "",
      photoSizeBytes: 0,
      otpVerified: false,
      otpId: null,
      amountCollected: amount,
      expectedAmount: expected,
      lat: null,
      lng: null,
      capturedAt: new Date().toISOString(),
    });
  } else {
    updateProofOfDelivery(orderId, { amountCollected: amount });
  }

  const discrepancy = +(amount - expected).toFixed(2);
  return NextResponse.json({
    ok: true,
    amountCollected: amount,
    expectedAmount: expected,
    discrepancy,
    hasMismatch: Math.abs(discrepancy) > 0.5,
  });
}