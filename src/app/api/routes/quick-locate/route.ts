import { NextResponse } from "next/server";
import { geocodeAddressFresh } from "@/lib/geocode";
import { getShopLocation } from "@/lib/db";
import { haversineMeters, roadRoute } from "@/lib/geo";
import { getQuadrantFromRef } from "@/lib/area-centroids";
import { getCompanyIdFromRequest } from "@/lib/tenant";

/**
 * POST /api/routes/quick-locate
 * Geocode a free-text address via Photon, then compute distance + direction
 * + ETA from the shop. Distance + ETA come from OSRM road network (with
 * haversine fallback) so the numbers match Google Maps.
 *
 * Body: { address: string }
 * Returns: {
 *   input: string,
 *   lat, lng, source, confidence, displayName,
 *   distanceMeters (road), straightLineMeters, estMinutes,
 *   direction (NW|NE|SW|SE from shop)
 * }
 */
export async function POST(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const raw = String(body?.address ?? "").trim();
    if (!raw) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    const parts = raw.split(",").map((s: string) => s.trim());
    const address = parts[0] ?? raw;
    const area = parts.length > 1 ? parts.slice(1).join(", ") : "";

    const result = await geocodeAddressFresh({
      address,
      area,
      customerName: null,
    });

    if (!result) {
      return NextResponse.json(
        {
          error: "No match found",
          input: raw,
          hint: "Try: 'House 27, Road 4, Dhanmondi, Dhaka' or just 'Gulshan 2'",
        },
        { status: 404 },
      );
    }

    const shop = getShopLocation(companyId);
    // Straight-line for reference / map scale.
    const straightLine = haversineMeters(shop.lat, shop.lng, result.lat, result.lng);
    // Road-network distance via OSRM (matches Google Maps).
    const road = await roadRoute([
      { lat: shop.lat, lng: shop.lng },
      { lat: result.lat, lng: result.lng },
    ]);
    const distanceMeters = road.totalDistanceMeters;
    const minutes = Math.round(road.totalDurationSeconds / 60);
    const direction = getQuadrantFromRef(result.lat, result.lng, shop);

    return NextResponse.json({
      input: raw,
      lat: result.lat,
      lng: result.lng,
      source: result.source,
      confidence: result.confidence,
      displayName: result.displayName,
      distanceMeters,
      straightLineMeters: Math.round(straightLine),
      estMinutes: minutes,
      direction,
      shop,
      distanceSource: road.source,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}