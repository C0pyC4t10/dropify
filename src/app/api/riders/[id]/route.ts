import { NextResponse, type NextRequest } from "next/server";
import {
  countActiveRiderOrders,
  deleteRider,
  getActiveRiderOrderIds,
  getRiders,
  recordRiderLoginAudit,
  updateRider,
} from "@/lib/db";
import { requireAdminCookie } from "@/lib/auth/admin-cookie-gate";
import { clientIp } from "@/lib/auth/rider-guard";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;
    const data = await request.json();
    const rider = updateRider(Number(idParam), data);
    if (!rider) return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    return NextResponse.json(rider);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdminCookie(request);
  if (denied) return denied;

  const { id: idParam } = await params;
  const riderId = Number(idParam);
  if (!Number.isInteger(riderId)) {
    return NextResponse.json({ ok: false, error: "Invalid rider id." }, { status: 400 });
  }
  const rider = getRiders().find((r) => r.id === riderId);
  if (!rider) {
    return NextResponse.json({ ok: false, error: "Rider not found." }, { status: 404 });
  }

  // Active-order guard. Deleting a rider while they have an open plan would
  // leave those orders pointing at a vanished rider and the dispatch board
  // would silently lose the visual link. Operators must reassign or close
  // those orders first; we surface the count + IDs so the UI can list them.
  const activeCount = countActiveRiderOrders(riderId);
  if (activeCount > 0) {
    const open = getActiveRiderOrderIds(riderId);
    return NextResponse.json(
      {
        ok: false,
        error: `Cannot delete rider with ${activeCount} active order${activeCount === 1 ? "" : "s"}. Reassign or close them first.`,
        activeOrderCount: activeCount,
        activeOrderIds: open.map((row) => row.id),
        activeOrderNos: open.map((row) => row.orderNo),
      },
      { status: 409 }
    );
  }

  const result = deleteRider(riderId);

  recordRiderLoginAudit({
    riderId,
    eventType: "session_revoked",
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") || "",
    success: true,
  });

  return NextResponse.json({
    ok: true,
    riderId,
    deletedName: result.deletedName,
    ordersArchived: result.ordersArchived,
  });
}
