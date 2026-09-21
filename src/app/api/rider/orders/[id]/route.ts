import { NextResponse, type NextRequest } from "next/server";
import {
  getRiderOrder,
  getProofOfDelivery,
  getDeliveryStatusHistory,
  getActiveDeliveryOtp,
  DELIVERY_OTP_MAX_ATTEMPTS,
} from "@/lib/db";
import {
  requireRider,
  riderGuardErrorResponse,
} from "@/lib/auth/rider-guard";
import { RIDER_STATUS_LABEL, FAIL_REASON_CODES } from "@/lib/rider-flow";
import { otpLast4FromHash } from "@/lib/otp-hint";

export const dynamic = "force-dynamic";

interface OtpState {
  last4: string | null;
  dispatchedAt: string | null;
  expiresAt: string | null;
  attempts: number;
  maxAttempts: number;
  /** True when the row is unexpired AND has attempts left. The rider
   *  can still enter a code in this window. */
  active: boolean;
}

export async function GET(
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
    return NextResponse.json({ ok: false, error: "Invalid order id." }, { status: 400 });
  }

  const order = getRiderOrder(guarded.rider.id, orderId);
  if (!order) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }

  const pod = getProofOfDelivery(orderId);
  const history = getDeliveryStatusHistory(orderId, 20);

  // Surface the active OTP so the rider knows whether the dispatcher has
  // already sent a code (and so the deliver page can show the input
  // immediately instead of the 'Send code' button).
  const activeOtp = getActiveDeliveryOtp(orderId);
  const now = Date.now();
  const otpState: OtpState | null = activeOtp
    ? {
        // last4 hint: derived from the salted hash (the actual code is
        // never persisted). See lib/otp-hint.ts for the derivation and
        // why a plain Number() call would silently produce "NaN" when
        // the slice contains hex letters.
        last4: otpLast4FromHash(activeOtp.codeHash),
        dispatchedAt: activeOtp.createdAt,
        expiresAt: activeOtp.expiresAt,
        attempts: activeOtp.attempts,
        maxAttempts: DELIVERY_OTP_MAX_ATTEMPTS,
        active:
          new Date(activeOtp.expiresAt).getTime() > now &&
          activeOtp.attempts < DELIVERY_OTP_MAX_ATTEMPTS,
      }
    : null;

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id,
      orderNo: order.orderNo,
      companyId: order.companyId,
      trackingCode: order.trackingCode,
      date: order.date,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      area: order.area,
      address: order.address,
      riderSeq: order.riderSeq,
      status: order.status,
      statusLabel: RIDER_STATUS_LABEL[order.status],
      paymentMethod: order.paymentMethod,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      total: order.total,
      paid: order.paid,
      codDue: order.paymentMethod === "cod" ? Math.max(0, order.total - (order.paid || 0)) : 0,
      lat: order.lat,
      lng: order.lng,
      items: order.items,
      note: order.note,
      confirmedAt: order.confirmedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      returnedAt: order.returnedAt,
      returnReason: order.returnReason,
      cancelReason: order.cancelReason,
    },
    pod: pod
      ? {
          photoPath: pod.photoPath,
          otpVerified: pod.otpVerified,
          amountCollected: pod.amountCollected,
          expectedAmount: pod.expectedAmount,
          capturedAt: pod.capturedAt,
          uploadedAt: pod.uploadedAt,
        }
      : null,
    otp: otpState,
    history: history.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      actorType: h.actorType,
      actorName: h.actorName,
      reason: h.reason,
      lat: h.lat,
      lng: h.lng,
      createdAt: h.createdAt,
    })),
    failReasons: FAIL_REASON_CODES,
  });
}