import { NextResponse, type NextRequest } from "next/server";
import {
  setRiderAccountStatus,
  getRiders,
  getRiderLoginAudit,
  recordRiderLoginAudit,
} from "@/lib/db";
import { requireAdminCookie } from "@/lib/auth/admin-cookie-gate";
import { clientIp } from "@/lib/auth/rider-guard";

export const dynamic = "force-dynamic";

export async function POST(
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

  const recent = getRiderLoginAudit(riderId, 20);
  const stillLocked = recent.filter((r) => r.eventType === "pin_lockout").length > 0;

  let targetStatus: "active" | "pending_verification";
  if (rider.accountStatus === "pending_verification") {
    targetStatus = "active";
  } else if (stillLocked) {
    targetStatus = "active";
  } else if (rider.accountStatus === "suspended" || rider.accountStatus === "deactivated") {
    targetStatus = "active";
  } else {
    return NextResponse.json({
      ok: false,
      error: `Rider is already ${rider.accountStatus}.`,
    }, { status: 400 });
  }

  const updated = setRiderAccountStatus(riderId, targetStatus);
  recordRiderLoginAudit({
    riderId,
    eventType: "login_success",
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") || "",
    success: true,
  });

  return NextResponse.json({
    ok: true,
    riderId,
    accountStatus: updated?.accountStatus,
    clearedPinLockout: stillLocked,
  });
}