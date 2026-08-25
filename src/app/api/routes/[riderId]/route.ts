import { NextResponse } from "next/server";
import {
  getRiderPlanOrders,
  setRiderPlan,
  clearRiderPlan,
  getShopLocation,
  todayStr,
} from "@/lib/db";
import { optimizeRoute, recomputeLegs, type Stop } from "@/lib/geo";

/**
 * GET /api/routes/[riderId]
 * Returns the rider's planned orders (in sequence) plus the shop origin.
 *
 * Query: ?date=YYYY-MM-DD (optional, defaults to today BD)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ riderId: string }> },
) {
  const { riderId: idParam } = await params;
  const riderId = Number(idParam);
  if (!Number.isFinite(riderId)) {
    return NextResponse.json({ error: "Invalid riderId" }, { status: 400 });
  }
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || todayStr();
  const orders = getRiderPlanOrders(riderId, date);
  const shop = getShopLocation();
  return NextResponse.json({ riderId, date, shop, orders });
}

/**
 * POST /api/routes/[riderId]
 * Optimize and save a plan. Body:
 *   { date: "YYYY-MM-DD", orderIds: number[], autoOptimize?: boolean }
 *
 * If `autoOptimize` is true (default), the optimizer (NN + 2-opt) determines
 * the sequence. If false, the orderIds order is preserved (dispatcher-
 * pre-sorted).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ riderId: string }> },
) {
  const { riderId: idParam } = await params;
  const riderId = Number(idParam);
  if (!Number.isFinite(riderId)) {
    return NextResponse.json({ error: "Invalid riderId" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const date: string = body.date || todayStr();
    const orderIds: number[] = Array.isArray(body.orderIds) ? body.orderIds : [];
    const autoOptimize: boolean = body.autoOptimize !== false;

    if (orderIds.length === 0) {
      // Treat as a "clear all" intent.
      const cleared = clearRiderPlan(riderId);
      return NextResponse.json({ riderId, date, cleared, sequence: [] });
    }

    // Read the orders to get their coordinates.
    const existing = getRiderPlanOrders(riderId, date);
    const existingById = new Map(existing.map((o) => [o.id, o]));

    // Also need to pull the unassigned orders the caller wants to add.
    const { getOrder, getUnassignedOrders } = await import("@/lib/db");
    const unassigned = getUnassignedOrders(date);
    const unassignedById = new Map(unassigned.map((o) => [o.id, o]));

    const orders: Array<{ id: number; lat: number | null; lng: number | null }> = [];
    for (const id of orderIds) {
      const o = existingById.get(id) ?? unassignedById.get(id) ?? getOrder(id);
      if (!o) continue;
      if (o.deliveryMode === "pathao") continue;
      if (o.status === "delivered" || o.status === "cancelled" || o.status === "pending-approval") continue;
      if (typeof o.lat !== "number" || typeof o.lng !== "number") continue;
      orders.push({ id: o.id, lat: o.lat, lng: o.lng });
    }
    if (orders.length === 0) {
      return NextResponse.json(
        { error: "No eligible orders with coordinates found" },
        { status: 400 },
      );
    }

    const shop = getShopLocation();
    let sequence: number[];
    if (autoOptimize) {
      const stops: Stop[] = orders.map((o) => ({ orderId: o.id, coord: { lat: o.lat!, lng: o.lng! } }));
      sequence = optimizeRoute(shop, stops).sequence;
    } else {
      // Respect caller's order; fall back to optimize if any IDs were missing.
      const want = new Set(orders.map((o) => o.id));
      sequence = orderIds.filter((id) => want.has(id));
      if (sequence.length !== orders.length) {
        // Some requested IDs were filtered out — fall back to optimizer.
        const stops: Stop[] = orders.map((o) => ({ orderId: o.id, coord: { lat: o.lat!, lng: o.lng! } }));
        sequence = optimizeRoute(shop, stops).sequence;
      }
    }

    const plan = sequence.map((id, i) => ({ orderId: id, seq: i + 1 }));
    const { updated, unassigned: unassignedCount } = setRiderPlan(riderId, plan);

    // Recompute legs for the response
    const byId = new Map(orders.map((o) => [o.id, { orderId: o.id, coord: { lat: o.lat!, lng: o.lng! } }]));
    const route = recomputeLegs(shop, sequence, byId);

    return NextResponse.json({
      riderId,
      date,
      updated,
      unassigned: unassignedCount,
      sequence,
      totalDistanceMeters: route.totalDistanceMeters,
      totalEstSeconds: route.totalEstSeconds,
      legs: route.legs,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * DELETE /api/routes/[riderId]
 * Clear all assignments for this rider.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ riderId: string }> },
) {
  const { riderId: idParam } = await params;
  const riderId = Number(idParam);
  if (!Number.isFinite(riderId)) {
    return NextResponse.json({ error: "Invalid riderId" }, { status: 400 });
  }
  const cleared = clearRiderPlan(riderId);
  return NextResponse.json({ riderId, cleared });
}
