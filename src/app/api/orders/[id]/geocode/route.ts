import { NextResponse, type NextRequest } from "next/server";
import { geocodeAndRefineOrder, updateOrder } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";
import { requireAdminCookie } from "@/lib/auth/admin-cookie-gate";

/**
 * POST /api/orders/[id]/geocode
 * Re-geocode the order's address via Photon and update its lat/lng.
 * Body: { force?: boolean } — when true, refresh even if the new result
 *   is within 100m of the existing coords.
 *
 * Returns: { updated, reason, before, after }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAdminCookie(request);
  if (denied) return denied;
  const companyId = await getCompanyIdFromRequest(request);
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const force = Boolean(body?.force);
    const result = await geocodeAndRefineOrder(id, companyId);
    if (force && result.reason === "no-improvement" && result.before && result.after) {
      // Force-update even when within 100m
      const updated = updateOrder(id, { lat: result.after.lat, lng: result.after.lng }, companyId);
      return NextResponse.json({
        updated: !!updated,
        reason: "forced",
        before: result.before,
        after: result.after,
      });
    }
    return NextResponse.json(result);
  } catch (e) {
    const err = e as { stack?: unknown };
    return NextResponse.json({ error: String(e), stack: String(err.stack ?? "") }, { status: 500 });
  }
}