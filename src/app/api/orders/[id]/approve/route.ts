import { NextResponse } from "next/server";
import { approveOrder, cancelPendingOrder } from "@/lib/db";
import { pushStatusToWoo } from "@/lib/wp-sync";

/**
 * POST /api/orders/:id/approve
 *   body: { action: "approve" } OR { action: "cancel", reason?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    const body = await request.json().catch(() => ({}));
    const action = body?.action === "cancel" ? "cancel" : "approve";

    let order;
    if (action === "approve") {
      order = approveOrder(id);
    } else {
      order = cancelPendingOrder(id, String(body?.reason || ""));
    }

    if (!order) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    // Best-effort WP sync — never blocks the response.
    if (order.wpOrderId) {
      pushStatusToWoo(order).catch(() => {});
    }

    return NextResponse.json({ ok: true, order }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 });
  }
}
