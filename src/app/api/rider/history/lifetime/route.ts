import { NextResponse, type NextRequest } from "next/server";
import { getRiderLifetimeStats } from "@/lib/db";
import {
  requireRider,
  riderGuardErrorResponse,
} from "@/lib/auth/rider-guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let guarded;
  try {
    guarded = requireRider(request, "access");
  } catch (err) {
    const r = riderGuardErrorResponse(err);
    if (r) return r;
    throw err;
  }
  const stats = getRiderLifetimeStats(guarded.rider.id);
  return NextResponse.json({ ok: true, ...stats });
}