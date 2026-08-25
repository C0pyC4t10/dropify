import { NextResponse } from "next/server";
import { updateOrder } from "@/lib/db";

/**
 * PUT /api/orders/[id]/coords
 * Manual pin-drop — set the lat/lng for an order (or clear with null).
 *
 * Body: { lat: number | null, lng: number | null }
 *
 * Used by the order detail page for the "drop pin" map control. After this
 * is set, the order will route from this exact point rather than the area
 * centroid.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const lat = body.lat === null || typeof body.lat === "number" ? body.lat : undefined;
    const lng = body.lng === null || typeof body.lng === "number" ? body.lng : undefined;
    if (lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: "lat and lng must be numbers or null" },
        { status: 400 },
      );
    }
    // If one is null and the other is set, refuse (consistency).
    if ((lat === null) !== (lng === null)) {
      return NextResponse.json(
        { error: "lat and lng must both be set or both be null" },
        { status: 400 },
      );
    }
    const order = updateOrder(id, { lat, lng });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json(order);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
