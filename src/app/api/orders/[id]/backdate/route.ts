import { NextResponse } from "next/server";
import { getOrder, updateOrder } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

// Admin endpoint to backdate an order's confirmedAt / deliveredAt timestamps.
// This is needed for one-time data recovery when restoring historical orders
// whose status was set via the API but whose timestamps got stamped with
// "now" instead of the original event time.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const { id: idParam } = await params;
    const id = Number(idParam);
    const body = await request.json();

    const existing = getOrder(id, companyId);
    if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const patch: Record<string, unknown> = {};
    if (body.confirmedAt !== undefined) patch.confirmedAt = body.confirmedAt;
    if (body.deliveredAt !== undefined) patch.deliveredAt = body.deliveredAt;
    if (body.createdAt !== undefined) patch.createdAt = body.createdAt;
    if (body.date !== undefined) patch.date = body.date;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No timestamps provided" }, { status: 400 });
    }

    const updated = updateOrder(id, patch, companyId);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}