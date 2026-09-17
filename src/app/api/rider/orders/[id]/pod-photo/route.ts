import { type NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  getRiderOrder,
  getProofOfDelivery,
} from "@/lib/db";
import {
  requireRider,
  riderGuardErrorResponse,
} from "@/lib/auth/rider-guard";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let guarded;
  try {
    guarded = requireRider(request, "access");
  } catch (err) {
    const resp = riderGuardErrorResponse(err);
    if (resp) return resp;
    throw err;
  }

  const { id: idParam } = await params;
  const orderId = Number(idParam);
  if (!Number.isInteger(orderId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const order = getRiderOrder(guarded.rider.id, orderId);
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