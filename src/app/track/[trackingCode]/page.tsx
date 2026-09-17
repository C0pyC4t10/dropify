import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getOrderByTrackingCode,
  getProofOfDelivery,
  getRiders,
} from "@/lib/db";
import { isValidTrackingCode } from "@/lib/tracking-code";
import { TrackingView } from "./tracking-view";
import type { OrderStatus } from "@/lib/types";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Live delivery tracking for your Dropify order.",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ trackingCode: string }>;
}

const PUBLIC_STEPS: Array<{ status: OrderStatus; label: string; description: string }> = [
  { status: "confirmed",        label: "Order confirmed",  description: "We've got your order and it's being prepared." },
  { status: "preparing",        label: "Ready for pickup", description: "Rider is on the way to pick up your order." },
  { status: "out-for-delivery", label: "Out for delivery", description: "Rider has your order and is heading your way." },
  { status: "delivered",        label: "Delivered",        description: "Your order has been delivered." },
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

export default async function TrackPage({ params }: PageProps) {
  const { trackingCode: rawCode } = await params;
  const trackingCode = (rawCode || "").trim().toUpperCase();
  if (!isValidTrackingCode(trackingCode)) notFound();

  const order = getOrderByTrackingCode(trackingCode);
  if (!order) notFound();

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

  const initialPayload = {
    trackingCode: order.trackingCode,
    status: order.status,
    statusLabel:
      order.status === "cancelled" ? "Cancelled" :
      order.status === "returned" ? "Could not deliver" :
      PUBLIC_STEPS.find((s) => s.status === order.status)?.label ?? order.status,
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
  podPhotoPath: showPodPhoto ? `/api/track/${order.trackingCode}/pod-photo` : null,
    etaText,
    steps: buildSteps(order.status),
    rider: rider ? { name: rider.name } : null,
  };

  return <TrackingView initial={initialPayload} />;
}