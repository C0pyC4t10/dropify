import { NextResponse, type NextRequest } from "next/server";
import {
  getRiderSessionByRefreshHash,
  revokeRiderSession,
  recordRiderLoginAudit,
} from "@/lib/db";
import { verifyRiderToken } from "@/lib/auth/rider-jwt";
import {
  requireRider,
  riderGuardErrorResponse,
  clientIp,
} from "@/lib/auth/rider-guard";

export const dynamic = "force-dynamic";

const REFRESH_COOKIE = "rider_refresh_token";

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

  const refreshCookie = request.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshCookie) {
    const verified = verifyRiderToken(refreshCookie, "refresh");
    if (verified.ok) {
      const session = getRiderSessionByRefreshHash(refreshCookie);
      if (session) revokeRiderSession(session.id);
    }
  }

  recordRiderLoginAudit({
    riderId: guarded.rider.id,
    eventType: "logout",
    ipAddress: ip,
    userAgent: ua,
    success: true,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: REFRESH_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}