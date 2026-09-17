import { NextResponse, type NextRequest } from "next/server";
import {
  getOrderByTrackingCode,
  getProofOfDelivery,
  getRiders,
} from "@/lib/db";
import { isValidTrackingCode } from "@/lib/tracking-code";
import { RIDER_STATUS_LABEL } from "@/lib/rider-flow";
import { consumeRateLimit } from "@/lib/auth/rider-rate-limit";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const PUBLIC_STEPS: Array<{ status: OrderStatus; label: string; description: string }> = [
  { status: "confirmed",        label: "Order confirmed",       description: "We've got your order and it's being prepared." },
  { status: "preparing",        label: "Ready for pickup",      description: "Rider is on the way to pick up your order." },
  { status: "out-for-delivery", label: "Out for delivery",      description: "Rider has your order and is heading your way." },
  { status: "delivered",        label: "Delivered",             description: "Your order has been delivered." },
];

const FAILURE_STATUSES: OrderStatus[] = ["cancelled", "returned"];

interface StepView {
  status: OrderStatus | null;
  label: string;
  description: string;
  done: boolean;
  current: boolean;
}

function buildSteps(currentStatus: OrderStatus): StepView[] {
  if (FAILURE_STATUSES.includes(currentStatus)) {
    const failureLabel = currentStatus === "cancelled" ? "Cancelled" : "Could not deliver";
    return [
      { status: currentStatus, label: failureLabel, description: "Contact dispatch for next steps.", done: true, current: true },
    ];
  }
  const currentIdx = PUBLIC_STEPS.findIndex((s) => s.status === currentStatus);
  return PUBLIC_STEPS.map((s, i) => ({
    status: s.status,
    label: s.label,
    description: s.description,
    done: currentIdx > i,
    current: currentIdx === i,
  }));
}

function errorResponse(
  status: number,
  error: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingCode: string }> }
) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? request.headers.get("x-real-ip")?.trim()
    ?? "unknown";
  const rl = consumeRateLimit("login", `track:${ip}`, { capacity: 60, refillPerMinute: 30 });
  if (!rl.ok) {
    return errorResponse(429, "Too many tracking lookups. Try again in a minute.", {
      reason: "rate_limited",
    });
  }

  const { trackingCode: rawCode } = await params;
  const trackingCode = (rawCode || "").trim().toUpperCase();
  if (!isValidTrackingCode(trackingCode)) {
    return errorResponse(400, "Tracking code is not in the expected format.");
  }

  const order = getOrderByTrackingCode(trackingCode);
  if (!order) {
    return errorResponse(404, "Tracking code not recognized. Double-check with the shop.", {
      reason: "unknown_code",
    });
  }

  const pod = getProofOfDelivery(order.id);
  const rider = order.riderId ? getRiders().find((r) => r.id === order.riderId) : undefined;

  let etaText: string | null = null;
  if (order.riderSeq && rider && order.status === "out-for-delivery") {
    etaText = `Stop ${order.riderSeq} on rider ${rider.name}'s route`;
  } else if (order.status === "preparing" && rider) {
    etaText = `Rider ${rider.name} is en route to the shop`;
  } else if (order.status === "confirmed") {
    etaText = "Rider assignment is being prepared";
  }

  const showPodPhoto =
    order.status === "delivered" && pod?.photoPath && pod.otpVerified;
  const podPhotoUrl = showPodPhoto ? `/api/track/${order.trackingCode}/pod-photo` : null;

  return NextResponse.json({
    ok: true,
    trackingCode: order.trackingCode,
    status: order.status,
    statusLabel: RIDER_STATUS_LABEL[order.status],
    orderNo: order.orderNo,
    customerName: order.customerName,
    area: order.area,
    itemCount: order.items.length,
    itemSummary: order.items
      .slice(0, 4)
      .map((it) => `${it.qty}${it.unit} ${it.name}`)
      .join(", "),
    placedAt: order.createdAt,
    confirmedAt: order.confirmedAt,
    deliveredAt: order.deliveredAt,
    returnedAt: order.returnedAt,
    cancelledAt: order.cancelledAt,
    paymentMethod: order.paymentMethod,
    total: order.total,
    codCollected: pod?.amountCollected ?? null,
    podPhotoPath: podPhotoUrl,
    etaText,
    steps: buildSteps(order.status),
    rider: rider
      ? {
          name: rider.name,
        }
      : null,
    pollerHint: { intervalMs: 15000 },
  });
}