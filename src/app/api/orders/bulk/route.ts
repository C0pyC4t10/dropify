import { NextResponse } from "next/server";
import { getOrders, setOrderStatus, deleteOrder, assignRider } from "@/lib/db";

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { ids, action } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
    }

    const results: Array<{ id: number; ok: boolean; error?: string }> = [];

    if (action === "confirm") {
      for (const id of ids) {
        try {
          setOrderStatus(id, "confirmed");
          results.push({ id, ok: true });
        } catch (e) {
          results.push({ id, ok: false, error: String(e) });
        }
      }
    } else if (action === "delivered") {
      for (const id of ids) {
        try {
          setOrderStatus(id, "delivered");
          results.push({ id, ok: true });
        } catch (e) {
          results.push({ id, ok: false, error: String(e) });
        }
      }
    } else if (action === "cancel") {
      const reason = typeof body.cancelReason === "string" ? body.cancelReason : "";
      for (const id of ids) {
        try {
          setOrderStatus(id, "cancelled", reason);
          results.push({ id, ok: true });
        } catch (e) {
          results.push({ id, ok: false, error: String(e) });
        }
      }
    } else if (action === "delete") {
      for (const id of ids) {
        try {
          deleteOrder(id);
          results.push({ id, ok: true });
        } catch (e) {
          results.push({ id, ok: false, error: String(e) });
        }
      }
    } else if (action === "assign") {
      const riderId = typeof body.riderId === "number" ? body.riderId : null;
      for (const id of ids) {
        try {
          // Unassign with riderId=null is allowed; clears riderSeq too via DB.
          if (riderId === null) {
            assignRider(id, null);
          } else {
            assignRider(id, riderId);
          }
          results.push({ id, ok: true });
        } catch (e) {
          results.push({ id, ok: false, error: String(e) });
        }
      }
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  // Convenience: list all orders client-side already calls /api/orders.
  // This route only handles bulk actions via PUT.
  return NextResponse.json(getOrders());
}