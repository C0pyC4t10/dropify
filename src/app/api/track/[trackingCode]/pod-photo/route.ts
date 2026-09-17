import { type NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  getOrderByTrackingCode,
  getProofOfDelivery,
} from "@/lib/db";
import { isValidTrackingCode } from "@/lib/tracking-code";
import { consumeRateLimit } from "@/lib/auth/rider-rate-limit";

export const dynamic = "force-dynamic";

/**
 * Public POD photo delivery — the tracking code in the URL is the bearer
 * token for the image. Anyone who knows the code can view the photo, which
 * matches the security model of the tracking page itself. The code is the
 * minimum disclosure needed for the customer to see proof of delivery.
 *
 * Returns 404 (not 403) on failure so we don't leak whether a code exists.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingCode: string }> }
) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? request.headers.get("x-real-ip")?.trim()
    ?? "unknown";
  const rl = consumeRateLimit("login", `track-photo:${ip}`, { capacity: 120, refillPerMinute: 60 });
  if (!rl.ok) {
    return new NextResponse("Too many requests", { status: 429 });
  }

  const { trackingCode: rawCode } = await params;
  const trackingCode = (rawCode || "").trim().toUpperCase();
  if (!isValidTrackingCode(trackingCode)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const order = getOrderByTrackingCode(trackingCode);
  if (!order) {
    return new NextResponse("Not found", { status: 404 });
  }

  const pod = getProofOfDelivery(order.id);
  if (!pod || !pod.photoPath || !pod.otpVerified) {
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
      "Cache-Control": "private, max-age=60, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}