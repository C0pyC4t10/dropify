import { NextResponse, type NextRequest } from "next/server";
import {
  getRiderSessionByRefreshHash,
  revokeRiderSession,
  createRiderSession,
  bindRiderSessionRefreshToken,
  recordRiderLoginAudit,
  getRiders,
} from "@/lib/db";
import {
  signRiderToken,
  accessTokenTtlSeconds,
  refreshTokenTtlSeconds,
  verifyRiderToken,
} from "@/lib/auth/rider-jwt";
import { clientIp } from "@/lib/auth/rider-guard";
import { consumeRateLimit } from "@/lib/auth/rider-rate-limit";

export const dynamic = "force-dynamic";

const REFRESH_COOKIE = "rider_refresh_token";
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

interface RefreshBody {
  refreshToken?: string;
}

function errorResponse(status: number, error: string, reason?: string): NextResponse {
  return NextResponse.json({ ok: false, error, reason }, { status });
}

function setRefreshCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: REFRESH_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

function readRefreshCookie(request: NextRequest): string | null {
  const c = request.cookies.get(REFRESH_COOKIE);
  return c?.value || null;
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") || "";
  const rl = consumeRateLimit("refresh", ip);
  if (!rl.ok) {
    return errorResponse(429, "Too many refresh attempts.", "rate_limited");
  }

  let body: RefreshBody = {};
  try {
    const text = await request.text();
    body = text ? (JSON.parse(text) as RefreshBody) : {};
  } catch {
    body = {};
  }

  const refreshToken = (body.refreshToken || readRefreshCookie(request) || "").trim();
  if (!refreshToken) {
    return errorResponse(400, "Refresh token missing.");
  }

  const verified = verifyRiderToken(refreshToken, "refresh");
  if (!verified.ok) {
    return errorResponse(401, "Refresh token invalid or expired.", "invalid_refresh");
  }

  const session = getRiderSessionByRefreshHash(refreshToken);
  if (!session || session.riderId !== verified.payload.sub) {
    return errorResponse(401, "Session revoked.", "session_revoked");
  }

  const rider = getRiders().find((r) => r.id === session.riderId);
  if (!rider) {
    return errorResponse(401, "Rider not found.", "unknown_rider");
  }
  if (rider.accountStatus === "suspended") {
    return errorResponse(403, "Account suspended. Contact dispatch.", "suspended");
  }
  if (rider.accountStatus === "deactivated") {
    return errorResponse(403, "Account deactivated. Contact dispatch.", "deactivated");
  }
  if (rider.accountStatus === "pending_verification") {
    return errorResponse(403, "Account pending admin verification.", "pending_verification");
  }

  const newSession = createRiderSession(session.riderId, "pending", session.deviceFingerprint);
  revokeRiderSession(session.id);
  recordRiderLoginAudit({
    riderId: session.riderId,
    eventType: "session_revoked",
    ipAddress: ip,
    userAgent: ua,
    success: true,
  });

  const accessToken = signRiderToken({
    riderId: session.riderId,
    sessionId: newSession.id,
    type: "access",
    ttlSeconds: accessTokenTtlSeconds(),
  });
  const newRefreshToken = signRiderToken({
    riderId: session.riderId,
    sessionId: newSession.id,
    type: "refresh",
    ttlSeconds: refreshTokenTtlSeconds(),
  });
  bindRiderSessionRefreshToken(newSession.id, newRefreshToken);

  const response = NextResponse.json({
    ok: true,
    accessToken,
    refreshToken: newRefreshToken,
    accessTokenExpiresIn: accessTokenTtlSeconds(),
    refreshTokenExpiresIn: refreshTokenTtlSeconds(),
  });
  setRefreshCookie(response, newRefreshToken);
  return response;
}