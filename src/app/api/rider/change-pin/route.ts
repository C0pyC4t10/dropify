import { NextResponse, type NextRequest } from "next/server";
import {
  verifyRiderPin,
  setRiderPinHash,
  recordRiderLoginAudit,
} from "@/lib/db";
import {
  requireRider,
  riderGuardErrorResponse,
  clientIp,
} from "@/lib/auth/rider-guard";

export const dynamic = "force-dynamic";

interface ChangePinBody {
  oldPin?: string;
  newPin?: string;
}

function errorResponse(status: number, error: string, reason?: string): NextResponse {
  return NextResponse.json({ ok: false, error, reason }, { status });
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") || "";
  let guarded;
  try {
    guarded = requireRider(request, "access");
  } catch (err) {
    const guardResp = riderGuardErrorResponse(err);
    if (guardResp) return guardResp;
    throw err;
  }

  let body: ChangePinBody;
  try {
    body = (await request.json()) as ChangePinBody;
  } catch {
    return errorResponse(400, "Invalid JSON body.");
  }

  const oldPin = (body.oldPin || "").trim();
  const newPin = (body.newPin || "").trim();
  if (!oldPin || !newPin) {
    return errorResponse(400, "Old and new PIN are required.");
  }
  if (!/^\d{4,8}$/.test(newPin)) {
    return errorResponse(400, "New PIN must be 4 to 8 digits.");
  }
  if (newPin === oldPin) {
    return errorResponse(400, "New PIN must be different from old PIN.");
  }

  const ok = verifyRiderPin(guarded.rider.id, oldPin);
  if (!ok) {
    recordRiderLoginAudit({
      riderId: guarded.rider.id,
      eventType: "login_fail",
      ipAddress: ip,
      userAgent: ua,
      success: false,
    });
    return errorResponse(401, "Old PIN is wrong.", "wrong_old_pin");
  }

  setRiderPinHash(guarded.rider.id, newPin, false);
  recordRiderLoginAudit({
    riderId: guarded.rider.id,
    eventType: "pin_change",
    ipAddress: ip,
    userAgent: ua,
    success: true,
  });

  return NextResponse.json({ ok: true });
}