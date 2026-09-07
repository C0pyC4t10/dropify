import { NextResponse } from "next/server";
import { bulkGeocodeOrders } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

/**
 * POST /api/routes/geocode-bulk
 * Bulk re-geocode orders for better pin placement on the map.
 *
 * Body: { date?: string; limit?: number }
 *
 * This is slow (one Photon call per order, ~200-500ms each). Use sparingly:
 * typically once on first deploy, or after a batch of new orders.
 */
export async function POST(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const date = typeof body?.date === "string" ? body.date : undefined;
    const limit = typeof body?.limit === "number" ? body.limit : undefined;
    const result = await bulkGeocodeOrders(companyId, { date, limit });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}