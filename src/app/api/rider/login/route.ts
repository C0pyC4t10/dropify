import { NextResponse, type NextRequest } from "next/server";
import {
  getRiderByPhone,
  verifyRiderPin,
  isRiderPinLockedOut,
  revokeAllRiderSessions,
  createRiderSession,
  bindRiderSessionRefreshToken,
  setRiderLastLoginAt,
  recordRiderLoginAudit,
  getRiderLoginAudit,
  setRiderAccountStatus,
} from "@/lib/db";
import {
  signRiderToken,
  accessTokenTtlSeconds,
  refreshTokenTtlSeconds,
} from "@/lib/auth/rider-jwt";
import { consumeRateLimit, resetRateLimit } from "@/lib/auth/rider-rate-limit";
import { clientIp } from "@/lib/auth/rider-guard";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const REFRESH_COOKIE = "rider_refresh_token";
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

interface LoginBody {
  phone?: string;
  pin?: string;
}

function errorResponse(status: number, error: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
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

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") || "";
  const loginIpLimit = consumeRateLimit("login-ip", ip);
  if (!loginIpLimit.ok) {
    return errorResponse(429, "Too many attempts. Slow down and try again shortly.", {
      reason: "rate_limited",
      retryAfterSeconds: loginIpLimit.retryAfterSeconds,
    });
  }

  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return errorResponse(400, "Invalid JSON body.");
  }

  const phoneRaw = (body.phone || "").trim();
  const pin = (body.pin || "").trim();
  if (!phoneRaw || !pin) {
    return errorResponse(400, "Phone and PIN are required.");
  }
  if (!/^\d{4,8}$/.test(pin)) {
    return errorResponse(400, "PIN must be 4 to 8 digits.");
  }
  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    return errorResponse(400, "Invalid phone number.");
  }

  const phoneLimit = consumeRateLimit("login", phone);
  if (!phoneLimit.ok) {
    return errorResponse(429, "Too many attempts on this number. Try again shortly.", {
      reason: "rate_limited",
      retryAfterSeconds: phoneLimit.retryAfterSeconds,
    });
  }

  const rider = getRiderByPhone(phone);
  const genericAuthError = () => errorResponse(401, "Wrong phone or PIN.");

  if (!rider) {
    recordRiderLoginAudit({
      riderId: 0,
      eventType: "login_fail",
      ipAddress: ip,
      userAgent: ua,
      success: false,
    });
    return genericAuthError();
  }

  if (rider.accountStatus === "suspended") {
    return errorResponse(403, "Account suspended. Contact dispatch.", { reason: "suspended" });
  }
  if (rider.accountStatus === "deactivated") {
    return errorResponse(403, "Account deactivated. Contact dispatch.", { reason: "deactivated" });
  }
  if (rider.accountStatus === "pending_verification") {
    return errorResponse(403, "Account pending admin verification.", { reason: "pending_verification" });
  }

  if (isRiderPinLockedOut(rider.id)) {
    return errorResponse(423, "PIN temporarily locked after repeated failures. Contact dispatch.", {
      reason: "pin_locked",
    });
  }

  const pinOk = verifyRiderPin(rider.id, pin);
  if (!pinOk) {
    recordRiderLoginAudit({
      riderId: rider.id,
      eventType: "login_fail",
      ipAddress: ip,
      userAgent: ua,
      success: false,
    });
    const recent = getRiderLoginAudit(rider.id, 20);
    const recentFails = recent.filter((r) => r.eventType === "login_fail").length;
    if (recentFails >= 5) {
      setRiderAccountStatus(rider.id, "suspended");
      revokeAllRiderSessions(rider.id);
      recordRiderLoginAudit({
        riderId: rider.id,
        eventType: "pin_lockout",
        ipAddress: ip,
        userAgent: ua,
        success: false,
      });
      return errorResponse(423, "Too many wrong PINs. Account suspended. Contact dispatch.", {
        reason: "pin_lockout",
      });
    }
    return genericAuthError();
  }

  revokeAllRiderSessions(rider.id);
  const session = createRiderSession(rider.id, "pending", ua.slice(0, 200));
  const accessToken = signRiderToken({
    riderId: rider.id,
    sessionId: session.id,
    type: "access",
    ttlSeconds: accessTokenTtlSeconds(),
  });
  const refreshToken = signRiderToken({
    riderId: rider.id,
    sessionId: session.id,
    type: "refresh",
    ttlSeconds: refreshTokenTtlSeconds(),
  });
  bindRiderSessionRefreshToken(session.id, refreshToken);
  setRiderLastLoginAt(rider.id);
  recordRiderLoginAudit({
    riderId: rider.id,
    eventType: "login_success",
    ipAddress: ip,
    userAgent: ua,
    success: true,
  });
  resetRateLimit("login", phone);

  const response = NextResponse.json({
    ok: true,
    accessToken,
    refreshToken,
    accessTokenExpiresIn: accessTokenTtlSeconds(),
    refreshTokenExpiresIn: refreshTokenTtlSeconds(),
    rider: {
      id: rider.id,
      name: rider.name,
      phone: rider.phone,
      vehicle: rider.vehicle,
      accountStatus: rider.accountStatus,
    },
    mustChangePin: rider.tempPin || rider.pinHash === "",
  });
  setRefreshCookie(response, refreshToken);
  return response;
}