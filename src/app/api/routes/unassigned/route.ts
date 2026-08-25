import { NextResponse } from "next/server";
import { getUnassignedOrders, todayStr } from "@/lib/db";

/**
 * GET /api/routes/unassigned
 * Returns own-rider orders that are eligible for planning (not yet assigned
 * to any rider, not delivered/cancelled, not pending-approval) for a date.
 *
 * Query: ?date=YYYY-MM-DD (optional, defaults to today BD)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || todayStr();
  const orders = getUnassignedOrders(date);
  return NextResponse.json({ date, orders });
}
