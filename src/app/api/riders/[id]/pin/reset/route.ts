import { NextResponse, type NextRequest } from "next/server";
import {
  setRiderPinHash,
  setRiderAccountStatus,
  getRiders,
  recordRiderLoginAudit,
} from "@/lib/db";
import { requireAdminCookie } from "@/lib/auth/admin-cookie-gate";
import { clientIp } from "@/lib/auth/rider-guard";
import crypto from "crypto";

export const dynamic = "force-dynamic";

interface ResetPinBody {
  pin?: string;
}

function generateRandomPin(): string {
  const n = crypto.randomInt(0, 10000);
  return String(n).padStart(4, "0");
}

/**
 * Reset (or set) a rider's login PIN and ensure the rider can log in.
 *
 * Auto-activation policy: if the rider is currently in a non-terminal state
 * (pending_verification, or active but with no PIN ever set), this single
 * call both issues a usable temp PIN AND flips accountStatus to 'active'
 * so the rider can log in immediately. Terminal states (suspended,
 * deactivated) require an explicit /reactivate first — this endpoint
 * refuses rather than silently re-activating a rider who was deliberately
 * taken out of service.
 */
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

  if (rider.accountStatus === "suspended" || rider.accountStatus === "deactivated") {
    return NextResponse.json({
      ok: false,
      error: `Rider is ${rider.accountStatus}. Use /reactivate first to restore the account, then reset the PIN.`,
      reason: "terminal_state",
      currentStatus: rider.accountStatus,
    }, { status: 409 });
  }

  let body: ResetPinBody = {};
  try {
    const text = await request.text();
    body = text ? (JSON.parse(text) as ResetPinBody) : {};
  } catch {
    body = {};
  }

  const providedPin = (body.pin || "").trim();
  let plaintextPin: string;
  if (providedPin) {
    if (!/^\d{4,8}$/.test(providedPin)) {
      return NextResponse.json({ ok: false, error: "PIN must be 4 to 8 digits." }, { status: 400 });
    }
    plaintextPin = providedPin;
  } else {
    plaintextPin = generateRandomPin();
  }

  setRiderPinHash(riderId, plaintextPin, true);

  let activatedNow = false;
  const previousStatus = rider.accountStatus;
  if (rider.accountStatus === "pending_verification" || (rider.accountStatus === "active" && !rider.pinHash)) {
    const updated = setRiderAccountStatus(riderId, "active");
    activatedNow = updated?.accountStatus === "active" && previousStatus !== "active";
  }

  recordRiderLoginAudit({
    riderId,
    eventType: "pin_change",
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") || "",
    success: true,
  });

  return NextResponse.json({
    ok: true,
    riderId,
    newPin: plaintextPin,
    mustChangeOnNextLogin: true,
    accountStatus: activatedNow ? "active" : previousStatus,
    previousAccountStatus: previousStatus,
    activatedNow,
    message:
      activatedNow
        ? "PIN reset and account activated. Share this PIN with the rider — they must change it on first login."
        : "Share this PIN with the rider once. They must change it on first login.",
  });
}