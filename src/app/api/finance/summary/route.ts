import { NextResponse, type NextRequest } from "next/server";
import { getCashSummary } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns aggregate revenue, rider cost, expenses, net, and a per-day
 * breakdown for the requested range. Tenant-scoped like the rest of the
 * operator API. No admin-cookie gate — the operator running a delivery
 * shift needs to see "how much money did we make today" without unlocking
 * admin mode.
 *
 * The heavy lifting lives in getCashSummary() (src/lib/db.ts).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json(
      { ok: false, error: "from and to query params are required (YYYY-MM-DD)." },
      { status: 400 }
    );
  }
  if (from > to) {
    return NextResponse.json(
      { ok: false, error: "from must be on or before to." },
      { status: 400 }
    );
  }

  const companyId = await getCompanyIdFromRequest(request);
  const summary = getCashSummary(from, to, companyId);

  return NextResponse.json({
    ok: true,
    ...summary,
  });
}
