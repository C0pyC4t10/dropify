import { NextResponse, type NextRequest } from "next/server";
import { getFirstActivityDate } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/first-activity
 *
 * Returns the earliest date (YYYY-MM-DD) on which the tenant has any
 * order or expense. Used by the Cash / P&L "All Time" preset so the
 * date range starts at the first real activity instead of
 * `0001-01-01` (which used to expand to ~740k day rows and lock the
 * page). Returns `{ ok: true, date: null }` when the tenant has no
 * recorded activity yet.
 */
export async function GET(request: NextRequest) {
  const companyId = await getCompanyIdFromRequest(request);
  const date = getFirstActivityDate(companyId);
  return NextResponse.json({ ok: true, date });
}
