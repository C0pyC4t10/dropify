import { NextResponse, type NextRequest } from "next/server";
import { getCashLifetime } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/lifetime
 *
 * Returns all-time revenue / rider cost / expenses / net / delivered-order
 * count for the active company. Tenant-scoped like the rest of the
 * operator API, no admin-cookie gate — the operator floor needs to see
 * this without unlocking admin mode.
 *
 * The Cash / P&L tab's top strip calls this on mount.
 */
export async function GET(request: NextRequest) {
  const companyId = await getCompanyIdFromRequest(request);
  const lifetime = getCashLifetime(companyId);
  return NextResponse.json({ ok: true, ...lifetime });
}
