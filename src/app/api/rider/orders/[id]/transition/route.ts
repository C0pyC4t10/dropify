import { NextResponse, type NextRequest } from "next/server";
import {
  getRiderOrder,
  getProofOfDelivery,
  insertDeliveryStatusHistory,
  setOrderStatus,
  ensureOrderTrackingCode,
} from "@/lib/db";
import {
  requireRider,
  riderGuardErrorResponse,
} from "@/lib/auth/rider-guard";
import {
  isRiderLegalTransition,
  riderTransitionRequiresPod,
  isFailReasonCode,
} from "@/lib/rider-flow";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

interface TransitionBody {
  toStatus?: OrderStatus;
  reason?: string;
  lat?: number | null;
  lng?: number | null;
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

  let body: TransitionBody;
  try {
    body = (await request.json()) as TransitionBody;
  } catch {
    return errorResponse(400, "Invalid JSON body.");
  }
  const toStatus = body.toStatus;
  if (!toStatus) {
    return errorResponse(400, "toStatus is required.");
  }

  const order = getRiderOrder(guarded.rider.id, orderId);
  if (!order) {
    return errorResponse(404, "Order not found.");
  }
  const fromStatus = order.status;

  if (!isRiderLegalTransition(fromStatus, toStatus)) {
    return errorResponse(400, `Cannot move order from "${fromStatus}" to "${toStatus}".`, {
      reason: "illegal_transition",
    });
  }

  if (riderTransitionRequiresPod(fromStatus, toStatus)) {
    // Per the latest rider-delivery spec update, the POD verification gate
    // for "Delivered" is OTP only. Photo upload is still collected (it
    // appears on the customer's tracking page and in dispatch's audit log)
    // but a missing photo does NOT block the transition. COD amount is
    // still required when paymentMethod=cod because reconciliation needs it.
    const pod = getProofOfDelivery(orderId);
    const otpVerified = !!pod?.otpVerified;
    if (!otpVerified) {
      return errorResponse(
        400,
        "Verify the customer OTP before marking delivered.",
        { reason: "pod_otp_required" }
      );
    }
    if (order.paymentMethod === "cod") {
      const got = pod?.amountCollected ?? null;
      if (got === null || got === undefined) {
        return errorResponse(
          400,
          "Capture the COD amount collected before marking delivered.",
          { reason: "pod_cod_required" }
        );
      }
    }
  }

  let reason: string | undefined;
  if (toStatus === "returned") {
    const code = (body.reason || "").trim();
    if (!code) {
      return errorResponse(400, "A reason is required when marking a delivery as failed.", {
        reason: "fail_reason_required",
      });
    }
    if (isFailReasonCode(code)) {
      reason = code;
    } else {
      reason = `other: ${code}`.slice(0, 200);
    }
  }

  const insertHist = insertDeliveryStatusHistory({
    orderId,
    fromStatus,
    toStatus,
    actorType: "rider",
    actorId: guarded.rider.id,
    actorName: guarded.rider.name,
    reason: reason ?? "",
    lat: body.lat ?? null,
    lng: body.lng ?? null,
  });
  if (!insertHist) {
    console.error("[rider-transition] audit insert failed; aborting transition");
    return errorResponse(500, "Audit log write failed.");
  }

  const updated = setOrderStatus(orderId, toStatus, order.companyId, reason);
  if (!updated) {
    return errorResponse(500, "Status update failed.");
  }

  if (toStatus === "out-for-delivery" && !updated.trackingCode) {
    ensureOrderTrackingCode(orderId);
  }

  const refreshed = getRiderOrder(guarded.rider.id, orderId);
  return NextResponse.json({
    ok: true,
    order: refreshed,
    historyId: insertHist.id,
  });
}