import { NextResponse } from "next/server";
import { getShopLocation } from "@/lib/db";
import { roadRoute } from "@/lib/geo";
import { getCompanyIdFromRequest } from "@/lib/tenant";

/**
 * POST /api/routes/road-distance
 * Compute OSRM road-network distances for a sequence of points (origin
 * first, then destinations). Falls back to haversine if OSRM fails.
 *
 * Body: { stops: [{ id?: number, lat: number, lng: number }] }
 *   - First entry is treated as the origin; subsequent entries are stops
 *     in visit order. The response is one leg per consecutive pair.
 *
 * Response:
 *   {
 *     totalDistanceMeters, totalDurationSeconds, source, fallbackReason,
 *     legs: [{ fromOrderId, toOrderId, distanceMeters, durationSeconds }]
 *   }
 */
export async function POST(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const stops = Array.isArray(body?.stops) ? body.stops : [];
    if (stops.length < 2) {
      return NextResponse.json({ error: "Need at least 2 points (origin + 1 stop)" }, { status: 400 });
    }

    const shop = getShopLocation(companyId);
    // If the caller didn't include an explicit origin, prepend the shop.
    const origin = stops[0]?.origin ? null : shop;
    const coords = origin
      ? [{ lat: shop.lat, lng: shop.lng }, ...stops.map((s: { lat: number; lng: number }) => ({ lat: s.lat, lng: s.lng }))]
      : stops.map((s: { lat: number; lng: number }) => ({ lat: s.lat, lng: s.lng }));

    const ids = stops.map((s: { id?: number }, i: number) => (s.id != null ? s.id : i === 0 ? null : null));
    const result = await roadRoute(coords);

    // Build per-leg descriptors matched back to the order IDs. The first
    // "leg" is from the shop to the first stop (no orderId on the "from"
    // side). Subsequent legs go stop → stop.
    const legs = result.legs.map((l, i) => {
      const toId = ids[i + 1] ?? null;
      const fromId = ids[i] ?? null;
      return {
        fromOrderId: fromId,
        toOrderId: toId,
        distanceMeters: l.distanceMeters,
        durationSeconds: l.durationSeconds,
      };
    });

    return NextResponse.json({
      totalDistanceMeters: result.totalDistanceMeters,
      totalDurationSeconds: result.totalDurationSeconds,
      source: result.source,
      fallbackReason: result.fallbackReason,
      legs,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}