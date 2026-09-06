import { NextResponse } from "next/server";
import { getOrder, updateOrder, setOrderStatus, assignRider, deleteOrder } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const order = getOrder(Number(idParam));
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json(order);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    const order = getOrder(id);
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
    const ok = deleteOrder(id);
    if (!ok) return NextResponse.json({ ok: false, error: "Delete failed" }, { status: 500 });
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    const data = await request.json();
    let order;
    if (data.status) {
      // Both "cancelled" and "returned" carry a reason string. The DB
      // function (setOrderStatus) picks the right one based on status —
      // it ignores cancelReason unless the transition is into "cancelled".
      const reason = data.cancelReason ?? data.returnReason;
      order = setOrderStatus(id, data.status, reason);
    } else if ("riderId" in data) {
      order = assignRider(id, data.riderId);
    } else {
      order = updateOrder(id, data);
    }
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
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