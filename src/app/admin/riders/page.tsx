import { cookies } from "next/headers";
import { ADMIN_MODE_COOKIE } from "@/lib/tenant-constants";
import { getRiders } from "@/lib/db";
import { AdminRidersTable } from "./admin-riders-table";

export const dynamic = "force-dynamic";

export default async function AdminRidersPage() {
  const store = await cookies();
  const adminMode = store.get(ADMIN_MODE_COOKIE)?.value === "1";
  const riders = getRiders();

  const initialPayload = {
    adminMode,
    riders: riders.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      vehicle: r.vehicle,
      status: r.status,
      homeCluster: r.homeCluster,
      subClusters: r.subClusters,
      accountStatus: r.accountStatus,
      tempPin: r.tempPin,
      lastLoginAt: r.lastLoginAt,
      maxStops: r.maxStops,
    })),
  };

  return <AdminRidersTable initial={initialPayload} />;
}