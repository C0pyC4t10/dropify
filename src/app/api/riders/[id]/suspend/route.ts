import { NextResponse, type NextRequest } from "next/server";
import {
  setRiderAccountStatus,
  revokeAllRiderSessions,
  recordRiderLoginAudit,
  getRiders,
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

  let reason = "";
  try {
    const text = await request.text();
    if (text) {
      const parsed = JSON.parse(text) as { reason?: string };
      reason = (parsed.reason || "").slice(0, 200);
    }
  } catch {
    /* ignore — reason optional */
  }

  const updated = setRiderAccountStatus(riderId, "suspended");
  const revokedCount = revokeAllRiderSessions(riderId);
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
    accountStatus: updated?.accountStatus,
    revokedSessions: revokedCount,
    reason,
  });
}