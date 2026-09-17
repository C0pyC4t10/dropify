import { NextResponse } from "next/server";
import {
  getRiders,
  getRiderSessionByRefreshHash,
} from "@/lib/db";
import { verifyRiderToken, type RiderTokenType } from "./rider-jwt";
import type { Rider } from "@/lib/types";

export interface GuardedRider {
  rider: Rider;
  sessionId: number;
}

export class RiderGuardError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string, message?: string) {
    super(message ?? reason);
    this.status = status;
    this.reason = reason;
  }
}

function extractBearer(request: Request): string | null {
  const auth = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function riderActive(rider: Rider): boolean {
  return rider.accountStatus === "active";
}

export function requireRider(
  request: Request,
  tokenType: RiderTokenType = "access"
): GuardedRider {
  const token = extractBearer(request);
  if (!token) throw new RiderGuardError(401, "missing_token", "Authentication required.");
  const result = verifyRiderToken(token, tokenType);
  if (!result.ok) {
    if (result.reason === "expired") throw new RiderGuardError(401, "token_expired", "Session expired. Sign in again.");
    throw new RiderGuardError(401, "invalid_token", "Authentication required.");
  }
  const { sub: riderId, sid: sessionId } = result.payload;
  const rider = getRiders().find((r) => r.id === riderId);
  if (!rider) throw new RiderGuardError(401, "unknown_rider", "Authentication required.");
  if (rider.accountStatus === "deactivated") {
    throw new RiderGuardError(403, "deactivated", "Account is deactivated. Contact dispatch.");
  }
  if (rider.accountStatus === "suspended") {
    throw new RiderGuardError(403, "suspended", "Account is suspended. Contact dispatch.");
  }
  if (rider.accountStatus === "pending_verification") {
    throw new RiderGuardError(403, "pending_verification", "Account pending admin verification.");
  }
  if (!riderActive(rider)) {
    throw new RiderGuardError(403, "inactive", "Account is not active.");
  }
  if (tokenType === "refresh") {
    const session = getRiderSessionByRefreshHash(token);
    if (!session || session.riderId !== riderId) {
      throw new RiderGuardError(401, "session_revoked", "Session revoked. Sign in again.");
    }
    return { rider, sessionId };
  }
  return { rider, sessionId };
}

export function riderGuardErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof RiderGuardError) {
    return NextResponse.json({ error: err.message, reason: err.reason }, { status: err.status });
  }
  return null;
}

export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}