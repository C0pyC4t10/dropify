import { NextResponse, type NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { getRiderOrder, insertProofOfDelivery } from "@/lib/db";
import {
  requireRider,
  riderGuardErrorResponse,
} from "@/lib/auth/rider-guard";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const POD_ROOT = path.join(process.cwd(), "data", "pod");

function errorResponse(
  status: number,
  error: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let guarded;
  try {
    guarded = requireRider(request, "access");
  } catch (err) {
    const r = riderGuardErrorResponse(err);
    if (r) return r;
    throw err;
  }

  const { id: idParam } = await params;
  const orderId = Number(idParam);
  if (!Number.isInteger(orderId)) {
    return errorResponse(400, "Invalid order id.");
  }

  const order = getRiderOrder(guarded.rider.id, orderId);
  if (!order) {
    return errorResponse(404, "Order not found.");
  }
  if (order.status === "delivered" || order.status === "returned" || order.status === "cancelled") {
    return errorResponse(409, `Cannot attach POD to a ${order.status} order.`, {
      reason: "terminal_status",
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "Multipart form expected.");
  }

  const file = form.get("photo");
  if (!file || !(file instanceof File)) {
    return errorResponse(400, "Field 'photo' is required.");
  }
  if (file.size > MAX_BYTES) {
    return errorResponse(413, "Photo is over 8 MB. Take a smaller photo and try again.", {
      reason: "too_large",
    });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) {
    return errorResponse(400, "Photo file is empty.");
  }

  let processed: sharp.Sharp;
  try {
    processed = sharp(buf).rotate();
  } catch {
    return errorResponse(400, "Photo is not a supported image (JPEG/PNG/HEIC/WebP).", {
      reason: "unsupported_format",
    });
  }

  const outDir = path.join(POD_ROOT, String(orderId));
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outName = `${stamp}.jpg`;
  const outPath = path.join(outDir, outName);
  try {
    await processed
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .withMetadata({ exif: {} })
      .toFile(outPath);
  } catch (err) {
    console.error("[pod-photo] sharp processing failed", err);
    return errorResponse(500, "Photo processing failed.");
  }

  const stat = fs.statSync(outPath);
  const relativePath = path.relative(process.cwd(), outPath);

  const expectedAmount = order.paymentMethod === "cod" ? order.total : 0;
  const pod = insertProofOfDelivery({
    orderId,
    photoPath: relativePath,
    photoSizeBytes: stat.size,
    otpVerified: false,
    otpId: null,
    amountCollected: null,
    expectedAmount,
    lat: null,
    lng: null,
    capturedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    photoPath: relativePath,
    photoSizeBytes: stat.size,
    podId: pod.id,
    expectedAmount: pod.expectedAmount,
  });
}