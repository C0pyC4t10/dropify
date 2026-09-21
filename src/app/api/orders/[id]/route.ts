import { NextResponse, type NextRequest } from "next/server";
import {
  getOrder,
  updateOrder,
  setOrderStatus,
  assignRider,
  deleteOrder,
  insertDeliveryStatusHistory,
  getProofOfDelivery,
} from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";
import { requireAdminCookie } from "@/lib/auth/admin-cookie-gate";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdminCookie(request);
  if (denied) return denied;
  const companyId = await getCompanyIdFromRequest(request);
  const { id: idParam } = await params;
  const order = getOrder(Number(idParam), companyId);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json(order);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdminCookie(request);
  if (denied) return denied;
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const { id: idParam } = await params;
    const id = Number(idParam);
    const order = getOrder(id, companyId);
    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    // Only allow delete from the approval queue — pending-approval orders
    // never touched stock or status flow, so they're safe to remove.
    // Delete on a confirmed/live order would silently re-add stock and is
    // almost certainly a misclick. Force a Cancel (which records reason)
    // for those instead.
    if (order.status !== "pending-approval") {
      return NextResponse.json(
        { ok: false, error: `Cannot delete a ${order.status} order. Cancel it instead to keep an audit trail.` },
        { status: 400 }
      );
    }
    const ok = deleteOrder(id, companyId);
    if (!ok) return NextResponse.json({ ok: false, error: "Delete failed" }, { status: 500 });
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdminCookie(request);
  if (denied) return denied;
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const { id: idParam } = await params;
    const id = Number(idParam);
    const data = await request.json();
    let order;
    let fromStatus: string | undefined;
    let adminActorName = "admin";
    if (typeof data.actorName === "string" && data.actorName.trim()) {
      adminActorName = data.actorName.trim().slice(0, 100);
    }
    if (data.status) {
      // Snapshot the status before mutating so the audit row records the
      // legal from→to transition the admin just performed.
      const before = getOrder(id, companyId);
      fromStatus = before?.status;
      // Both "cancelled" and "returned" carry a reason string. The DB
      // function (setOrderStatus) picks the right one based on status —
      // it ignores cancelReason unless the transition is into "cancelled".
      const reason = data.cancelReason ?? data.returnReason;
      order = setOrderStatus(id, data.status, companyId, reason);
    } else if ("riderId" in data) {
      order = assignRider(id, data.riderId, companyId);
    } else {
      order = updateOrder(id, data, companyId);
    }
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (data.status && fromStatus) {
      let historyReason = "";
      if (data.status === "delivered") {
        const pod = getProofOfDelivery(id);
        const podComplete =
          pod &&
          pod.photoPath &&
          pod.otpVerified &&
          (order.paymentMethod !== "cod" || pod.amountCollected !== null);
        if (!podComplete) {
          historyReason = "admin_override_pod_bypass";
        }
      }
      insertDeliveryStatusHistory({
        orderId: id,
        fromStatus,
        toStatus: data.status,
        actorType: "admin",
        actorId: 0,
        actorName: adminActorName,
        reason: historyReason,
      });
    }
    return NextResponse.json(order);
  } catch (error) {
    const msg = String(error);
    const isValidation =
      msg.includes("Cannot move") ||
      msg.includes("Cannot un-cancel") ||
      msg.includes("Cannot move a delivered") ||
      msg.includes("Cannot move a returned");
    return NextResponse.json({ error: msg }, { status: isValidation ? 400 : 500 });
  }
}