import { NextResponse } from "next/server";
import { getRidersWithPlans, todayStr } from "@/lib/db";

/**
 * GET /api/routes
 * Returns all riders who have a plan for a given date, plus their orders
 * in sequence, plus the total plan distance. Defaults to today (BD).
 *
 * Query: ?date=YYYY-MM-DD (optional)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || todayStr();
  const result = getRidersWithPlans(date);
  return NextResponse.json({ date, riders: result });
}
