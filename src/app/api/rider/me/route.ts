import { NextResponse, type NextRequest } from "next/server";
import {
  getRiderPlanOrders,
  getRiders,
} from "@/lib/db";
import {
  requireRider,
  riderGuardErrorResponse,
} from "@/lib/auth/rider-guard";
import { todayStr } from "@/lib/db";
import { riderAvatarUrl } from "@/lib/rider-avatar";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let guarded;
  try {
    guarded = requireRider(request, "access");
  } catch (err) {
    const guardResp = riderGuardErrorResponse(err);
    if (guardResp) return guardResp;
    throw err;
  }

  const riderId = guarded.rider.id;
  const fresh = getRiders().find((r) => r.id === riderId)!;
  const date = todayStr();

  const allCompanies = [1, 2, 3, 4, 5];
  const todaysOrders = allCompanies.flatMap((companyId) =>
    getRiderPlanOrders(riderId, date, companyId)
  );

  const total = todaysOrders.length;
  const pending = todaysOrders.filter(
    (o) => !["delivered", "cancelled", "returned"].includes(o.status)
  ).length;
  const delivered = todaysOrders.filter((o) => o.status === "delivered").length;
  const failed = todaysOrders.filter((o) =>
    ["cancelled", "returned"].includes(o.status)
  ).length;
  const codExpected = todaysOrders
    .filter((o) => o.status === "delivered" && o.paymentMethod === "cod")
    .reduce((s, o) => s + (o.total - (o.paid || 0)), 0);

  return NextResponse.json({
    ok: true,
    rider: {
      id: fresh.id,
      name: fresh.name,
      phone: fresh.phone,
      vehicle: fresh.vehicle,
      homeCluster: fresh.homeCluster,
      accountStatus: fresh.accountStatus,
      lastLoginAt: fresh.lastLoginAt,
      avatarPath: fresh.avatarPath,
      avatarUrl: riderAvatarUrl(fresh.id, fresh.avatarPath),
    },
    today: {
      date,
      totalOrders: total,
      pending,
      delivered,
      failed,
      codExpected,
    },
  });
}