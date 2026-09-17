import { NextResponse, type NextRequest } from "next/server";
import {
  getRiderOrder,
  verifyDeliveryOtp,
  getProofOfDelivery,
  updateProofOfDelivery,
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

  let body: { code?: string };
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return errorResponse(400, "Invalid JSON body.");
  }
  const code = (body.code || "").trim();
  if (!/^\d{4}$/.test(code)) {
    return errorResponse(400, "OTP must be 4 digits.");
  }

  const ok = verifyDeliveryOtp(orderId, code);
  if (!ok) {
    return errorResponse(400, "OTP is wrong or expired. Request a new code and try again.", {
      reason: "wrong_or_expired",
    });
  }

  const pod = getProofOfDelivery(orderId);
  if (pod) {
    updateProofOfDelivery(orderId, { otpVerified: true });
  }

  return NextResponse.json({
    ok: true,
    otpVerified: true,
  });
}