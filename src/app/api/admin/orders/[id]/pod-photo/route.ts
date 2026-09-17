import { type NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  getOrder,
  getProofOfDelivery,
  DEFAULT_COMPANY_ID,
} from "@/lib/db";
import { requireAdminCookie } from "@/lib/auth/admin-cookie-gate";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdminCookie(request);
  if (denied) return denied;

  const { id: idParam } = await params;
  const orderId = Number(idParam);
  if (!Number.isInteger(orderId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Multi-tenant: admins reach POD photos via the active tenant. Default
  // tenant is fine here — dispatch is single-tenant in this scope. The
  // admin UI passes the orderId only; matching the cookie's tenant is
  // a future enhancement if/when the admin console switches tenants
  // mid-shift.
  const order = getOrder(orderId, DEFAULT_COMPANY_ID);
  if (!order) {
    return new NextResponse("Not found", { status: 404 });
  }

  const pod = getProofOfDelivery(orderId);
  if (!pod || !pod.photoPath) {
    return new NextResponse("Not found", { status: 404 });
  }

  const absPath = path.isAbsolute(pod.photoPath)
    ? pod.photoPath
    : path.join(process.cwd(), pod.photoPath);
  if (!fs.existsSync(absPath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const stat = fs.statSync(absPath);
  const buf = fs.readFileSync(absPath);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(stat.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}