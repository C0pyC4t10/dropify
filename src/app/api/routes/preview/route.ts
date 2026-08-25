import { NextResponse } from "next/server";
import { getShopLocation, todayStr, getOrders, getUnassignedOrders } from "@/lib/db";
import { haversineMeters, roadRoute } from "@/lib/geo";
import { getQuadrantFromRef, getQuadrantFromCenter } from "@/lib/area-centroids";
import type { Order } from "@/lib/types";

/**
 * GET /api/routes/preview
 * Returns a "direction view" — all eligible orders (unassigned or in the
 * passed `selectedIds`), each tagged with its distance from the shop and
 * its quadrant (NE/NW/SE/SW) relative to the shop. Distance comes from
 * OSRM road network so it matches Google Maps.
 *
 * Query:
 *   - date=YYYY-MM-DD (optional)
 *   - selectedIds=1,2,3 (optional) — limit the set to just these order IDs
 *   - scope=all|unassigned|assigned (optional, default "all")
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || todayStr();
  const selectedIdsRaw = url.searchParams.get("selectedIds");
  const scope = (url.searchParams.get("scope") || "all") as "all" | "unassigned" | "assigned";

  let orders: Order[] = [];
  let skippedDateMismatch = 0;
  if (selectedIdsRaw) {
    const wanted = new Set(
      selectedIdsRaw
        .split(",")
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n)),
    );
    const allOrders = getOrders();
    orders = allOrders.filter((o) => wanted.has(o.id));
    skippedDateMismatch = orders.filter((o) => o.date !== date).length;
  } else if (scope === "unassigned") {
    orders = getUnassignedOrders(date);
  } else {
    orders = getOrders().filter(
      (o) =>
        o.date === date &&
        o.deliveryMode !== "pathao" &&
        o.status !== "delivered" &&
        o.status !== "cancelled" &&
        o.status !== "pending-approval",
    );
  }

  const shop = getShopLocation();

  // Compute per-order distance via OSRM in batches (origin → each stop)
  // and group by direction. OSRM is cached per coord-pair, so multiple
  // previews in a session are instant.
  const withCoords = orders.filter((o) => typeof o.lat === "number" && typeof o.lng === "number");
  const items: Array<{
    order: Order;
    distanceMeters: number;
    straightLineMeters: number;
    estMinutes: number;
    direction: "NW" | "NE" | "SW" | "SE";
    centerQuadrant: "NW" | "NE" | "SW" | "SE";
  }> = [];

  // Batch all origin → stop calls into one OSRM call when there are
  // many orders. OSRM accepts up to ~25 waypoints per request, so we
  // can fan out from the shop to all stops in one round-trip.
  if (withCoords.length > 0) {
    const coords = [
      { lat: shop.lat, lng: shop.lng },
      ...withCoords.map((o) => ({ lat: o.lat!, lng: o.lng! })),
    ];
    // If too many, chunk into groups of 24.
    const chunkSize = 24;
    const legs: Array<{ distance: number; duration: number } | null> = [];
    for (let i = 0; i < coords.length; i += chunkSize) {
      const chunk = coords.slice(i, i + chunkSize + 1);
      const rr = await roadRoute(chunk);
      if (i === 0) {
        for (const l of rr.legs) {
          legs.push({ distance: l.distanceMeters, duration: l.durationSeconds });
        }
      } else {
        // skip the first leg (which is from the previous chunk's last coord)
        for (let j = 1; j < rr.legs.length; j++) {
          const l = rr.legs[j];
          legs.push({ distance: l.distanceMeters, duration: l.durationSeconds });
        }
      }
    }

    for (let idx = 0; idx < withCoords.length; idx++) {
      const o = withCoords[idx];
      const leg = legs[idx] ?? null;
      const straight = haversineMeters(shop.lat, shop.lng, o.lat!, o.lng!);
      const dir = getQuadrantFromRef(o.lat!, o.lng!, shop);
      const centerDir = getQuadrantFromCenter(o.lat!, o.lng!);
      items.push({
        order: o,
        distanceMeters: leg ? leg.distance : Math.round(straight),
        straightLineMeters: Math.round(straight),
        estMinutes: leg ? Math.round(leg.duration / 60) : Math.round(straight / (30_000 / 3600) / 60),
        direction: dir,
        centerQuadrant: centerDir,
      });
    }
  }

  // Group by direction
  const groups: Record<"NW" | "NE" | "SW" | "SE", typeof items> = {
    NW: [],
    NE: [],
    SW: [],
    SE: [],
  };
  for (const it of items) groups[it.direction].push(it);

  // Sort each group by distance (closest first)
  for (const dir of ["NW", "NE", "SW", "SE"] as const) {
    groups[dir].sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  // Summary per direction
  const summary = (["NW", "NE", "SW", "SE"] as const).map((dir) => {
    const list = groups[dir];
    const totalDistance = list.reduce((s, i) => s + i.distanceMeters, 0);
    return {
      direction: dir,
      count: list.length,
      totalDistanceMeters: totalDistance,
      avgDistanceMeters: list.length === 0 ? 0 : Math.round(totalDistance / list.length),
      nearestOrderId: list[0]?.order.id ?? null,
      nearestDistanceMeters: list[0]?.distanceMeters ?? 0,
    };
  });

  return NextResponse.json({
    date,
    shop,
    counts: {
      total: items.length,
      withCoords: items.length,
      withoutCoords: orders.length - items.length,
    },
    groups,
    summary,
    skippedDateMismatch,
    distanceSource: "osrm",
  });
}