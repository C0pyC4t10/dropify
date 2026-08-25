import { NextResponse } from "next/server";
import { getOrder, updateOrder, setOrderStatus, assignRider } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const order = getOrder(Number(idParam));
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json(order);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    const data = await request.json();
    let order;
    if (data.status) {
      order = setOrderStatus(id, data.status, data.cancelReason);
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
      msg.includes("Cannot move a delivered");
    return NextResponse.json({ error: msg }, { status: isValidation ? 400 : 500 });
  }
}