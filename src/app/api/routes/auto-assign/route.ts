import { NextResponse } from "next/server";
import { autoAssignOrdersByCluster, getRiders } from "@/lib/db";

/**
 * POST /api/routes/auto-assign
 *
 * Body: { date: "YYYY-MM-DD" }
 *
 * Round-robins today's unassigned own-rider orders to the active riders
 * whose homeCluster (or subClusters) matches each order's cluster.
 * Honours rider.maxStops. Does NOT touch riderSeq — sequence is set by
 * the route planner UI after a dispatcher reviews the assignments.
 */
export async function POST(request: Request) {
  try {
    const { date } = (await request.json()) as { date?: string };
    if (!date) {
      return NextResponse.json({ error: "date is required" }, { status: 400 });
    }
    const result = autoAssignOrdersByCluster(date);
    // Enrich with rider names so the UI can show "3 orders → Mehedi" etc.
    const riders = getRiders();
    const riderNames: Record<number, string> = {};
    for (const r of riders) riderNames[r.id] = r.name;
    const byRider = Object.fromEntries(
      Object.entries(result.byRider).map(([rid, n]) => [rid, { name: riderNames[Number(rid)] ?? `#${rid}`, count: n }]),
    );
    return NextResponse.json({ ...result, byRider });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
