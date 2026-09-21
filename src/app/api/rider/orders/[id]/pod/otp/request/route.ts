import { NextResponse, type NextRequest } from "next/server";
import {
  getRiderOrder,
  createDeliveryOtp,
  markDeliveryOtpSmsSent,
  getProofOfDelivery,
  insertProofOfDelivery,
  expectedAmountForOrder,
} from "@/lib/db";
import {
  requireRider,
  riderGuardErrorResponse,
} from "@/lib/auth/rider-guard";
import { activeSmsAdapter } from "@/lib/notify/sms-console";
import { consumeRateLimit } from "@/lib/auth/rider-rate-limit";

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
  if (!order.customerPhone) {
    return errorResponse(400, "Order has no customer phone on file — cannot send OTP.", {
      reason: "no_phone",
    });
  }
  if (order.status === "delivered" || order.status === "returned" || order.status === "cancelled") {
    return errorResponse(409, `Cannot request OTP for a ${order.status} order.`);
  }

  const rl = consumeRateLimit("login", `otp:${orderId}`, { capacity: 3, refillPerMinute: 0.3 });
  if (!rl.ok) {
    return errorResponse(429, "Too many OTP requests. Try again in a few minutes.", {
      reason: "rate_limited",
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const phone = order.customerPhone;
  const created = createDeliveryOtp({ orderId, phone });

  const body = `Your Bazarey Ltd Meat delivery code is ${created.code}. Share it with the rider to confirm receipt.`;
  const sendResult = await activeSmsAdapter.sendSms({ to: phone, body });
  if (sendResult.ok) {
    markDeliveryOtpSmsSent(created.id);
  }

  let pod = getProofOfDelivery(orderId);
  if (!pod) {
    pod = insertProofOfDelivery({
      orderId,
      photoPath: "",
      photoSizeBytes: 0,
      otpVerified: false,
      otpId: created.id,
      amountCollected: null,
      expectedAmount: expectedAmountForOrder(order),
      lat: null,
      lng: null,
      capturedAt: "",
    });
  }

  return NextResponse.json({
    ok: true,
    otpId: created.id,
    expiresAt: created.expiresAt,
    smsSent: sendResult.ok,
    providerId: sendResult.providerId,
    podId: pod.id,
    expectedAmount: pod.expectedAmount,
    last4: created.code.slice(-2),
    customerPhoneMasked: phone.length >= 4 ? `****${phone.slice(-4)}` : "****",
  });
}