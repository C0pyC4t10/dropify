import { NextResponse, type NextRequest } from "next/server";
import {
  getOrder,
  setOrderStatus,
  insertDeliveryStatusHistory,
  insertProofOfDelivery,
  updateProofOfDelivery,
  expectedAmountForOrder,
} from "@/lib/db";
import type { OrderStatus } from "@/lib/types";
import { getCompanyIdFromRequest } from "@/lib/tenant";
import { requireAdminCookie } from "@/lib/auth/admin-cookie-gate";

export const dynamic = "force-dynamic";

interface OverrideBody {
  toStatus?: string;
  reason?: string;
  reasonText?: string;
  reasonCode?: string;
  codAmount?: number | null;
  notes?: string;
  actorName?: string;
}

const REASON_CODES = [
  "customer_confirmed_verbally",
  "rider_offline_otp_expired",
  "address_verified_on_call",
  "duplicate_pod_upload",
  "address_unreachable",
  "other",
] as const;

function isReasonCode(s: string): s is (typeof REASON_CODES)[number] {
  return (REASON_CODES as readonly string[]).includes(s);
}

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
  const denied = requireAdminCookie(request);
  if (denied) return denied;
  const companyId = await getCompanyIdFromRequest(request);

  const { id: idParam } = await params;
  const orderId = Number(idParam);
  if (!Number.isInteger(orderId)) {
    return errorResponse(400, "Invalid order id.");
  }

  const order = getOrder(orderId, companyId);
  if (!order) {
    return errorResponse(404, "Order not found in this tenant.");
  }

  let body: OverrideBody;
  try {
    body = (await request.json()) as OverrideBody;
  } catch {
    return errorResponse(400, "Invalid JSON body.");
  }

  const toStatus: OrderStatus = (body.toStatus as OrderStatus | undefined) ?? "delivered";
  const reasonCode = body.reasonCode ?? "other";
  const reasonTextRaw = body.reasonText ?? body.reason ?? "";
  const reasonText = reasonTextRaw.trim().slice(0, 200);
  const actorName = (body.actorName || "admin").trim().slice(0, 100);

  if (!isReasonCode(reasonCode)) {
    return errorResponse(400, "Invalid reasonCode.", { validCodes: REASON_CODES });
  }

  const reason = reasonCode === "other" && reasonText
    ? `other: ${reasonText}`
    : reasonCode;

  // Snapshot before transition so the audit row carries a clean from→to.
  const fromStatus = order.status;

  // Capture any admin-supplied COD amount into the POD row before the
  // transition (so the audit trail captures the amount alongside the
  // override decision).
  const codAmount = body.codAmount;
  if (codAmount !== undefined && codAmount !== null) {
    if (order.paymentMethod !== "cod") {
      return errorResponse(400, "codAmount only valid for COD orders.");
    }
    if (typeof codAmount !== "number" || !Number.isFinite(codAmount) || codAmount < 0) {
      return errorResponse(400, "codAmount must be a non-negative number.");
    }
    const existingPod = insertProofOfDelivery({
      orderId,
      photoPath: "",
      photoSizeBytes: 0,
      otpVerified: false,
      otpId: null,
      amountCollected: codAmount,
      expectedAmount: expectedAmountForOrder(order),
      lat: null,
      lng: null,
      capturedAt: new Date().toISOString(),
    });
    // If the POD row already existed (which it can — insertProofOfDelivery
    // is a no-op when orderId already has a row), patch the amount.
    updateProofOfDelivery(orderId, { amountCollected: codAmount });
    void existingPod;
  }

  const updated = setOrderStatus(orderId, toStatus, companyId, reason);
  if (!updated) {
    return errorResponse(500, "Failed to update status.");
  }

  insertDeliveryStatusHistory({
    orderId,
    fromStatus,
    toStatus,
    actorType: "admin",
    actorId: 0,
    actorName,
    reason: `admin_override_pod_bypass:${reasonCode}${reasonText ? ` — ${reasonText}` : ""}${body.notes ? ` [notes: ${body.notes.slice(0, 200)}]` : ""}`,
  });

  return NextResponse.json({
    ok: true,
    order: updated,
    override: {
      toStatus,
      reasonCode,
      reasonText,
      codecAmount: codAmount ?? null,
      actorName,
    },
  });
}