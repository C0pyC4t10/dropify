import { NextResponse, type NextRequest } from "next/server";
import {
  getOrder,
  createDeliveryOtp,
  markDeliveryOtpSmsSent,
  insertDeliveryStatusHistory,
} from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";
import { requireAdminCookie } from "@/lib/auth/admin-cookie-gate";
import { activeSmsAdapter } from "@/lib/notify/sms-provider";
import { clientIp } from "@/lib/auth/rider-guard";

export const dynamic = "force-dynamic";

/**
 * Dispatcher-issued OTP resend. Used when the rider can't reach the
 * customer themselves (no phone, no signal, customer asks for the code
 * again) — the operator triggers the SMS on the rider's behalf.
 *
 * The endpoint doesn't gate on status: any order that's pre-delivery
 * (so the customer is still expecting a delivery) can have a fresh code
 * dispatched. The audit row records `otp_dispatched:last4=..,actor=...` so
 * the dispatcher's role in the chain is visible on the dispatch board.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdminCookie(request);
  if (denied) return denied;

  const companyId = await getCompanyIdFromRequest(request);
  const { id: idParam } = await params;
  const orderId = Number(idParam);
  if (!Number.isInteger(orderId)) {
    return NextResponse.json({ ok: false, error: "Invalid order id." }, { status: 400 });
  }

  const order = getOrder(orderId, companyId);
  if (!order) {
    return NextResponse.json({ ok: false, error: "Order not found in this tenant." }, { status: 404 });
  }

  const terminalLike: ReadonlyArray<string> = ["delivered", "returned", "cancelled"];
  if (terminalLike.includes(order.status)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Cannot dispatch OTP for a ${order.status} order.`,
        reason: "terminal_status",
      },
      { status: 409 },
    );
  }

  if (!order.customerPhone) {
    return NextResponse.json(
      { ok: false, error: "Order has no customer phone on file." },
      { status: 400 },
    );
  }

  let actorName = "dispatcher";
  try {
    const text = await request.text();
    if (text) {
      const body = JSON.parse(text) as { actorName?: string };
      if (body.actorName && typeof body.actorName === "string") {
        actorName = body.actorName.trim().slice(0, 100) || "dispatcher";
      }
    }
  } catch {
    /* body optional */
  }

  const created = createDeliveryOtp({ orderId, phone: order.customerPhone });

  const body_text = `Your Bazarey Ltd Meat delivery code is ${created.code}. Share it with the rider to confirm receipt.`;
  const sendResult = await activeSmsAdapter.sendSms({ to: order.customerPhone, body: body_text });
  if (sendResult.ok) {
    markDeliveryOtpSmsSent(created.id);
  }

  // Persist the SMS failure reason on the audit row so the dispatch
  // board can surface "Your ip X not Whitelisted" (or whatever
  // BulksmsBD replied) next to the OTP badge.
  const reason = sendResult.ok
    ? `otp_dispatched:last4=••${created.code.slice(-2)}:by=${actorName}:sms=ok`
    : `otp_dispatched:last4=••${created.code.slice(-2)}:by=${actorName}:sms=fail:err=${(sendResult.error ?? "unknown").slice(0, 200)}`;
  insertDeliveryStatusHistory({
    orderId,
    fromStatus: order.status,
    toStatus: order.status,
    actorType: "admin",
    actorId: 0,
    actorName,
    reason,
  });

  return NextResponse.json({
    ok: true,
    orderId,
    otpId: created.id,
    expiresAt: created.expiresAt,
    smsSent: sendResult.ok,
    providerId: sendResult.providerId,
    last4: created.code.slice(-2),
    customerPhoneMasked:
      order.customerPhone.length >= 4 ? `****${order.customerPhone.slice(-4)}` : "****",
    actorName,
  });
}