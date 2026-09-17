import { NextResponse, type NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import {
  getRiders,
  setRiderAvatarPath,
} from "@/lib/db";
import {
  requireRider,
  riderGuardErrorResponse,
} from "@/lib/auth/rider-guard";
import { AVATAR_ROOT, riderAvatarUrl } from "@/lib/rider-avatar";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const AVATAR_MAX_DIM = 512;

function errorResponse(status: number, error: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  let guarded;
  try {
    guarded = requireRider(request, "access");
  } catch (err) {
    const r = riderGuardErrorResponse(err);
    if (r) return r;
    throw err;
  }
  const riderId = guarded.rider.id;

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
  if (!file.type.startsWith("image/")) {
    return errorResponse(415, "Photo must be an image (JPEG/PNG/WebP).", { reason: "not_image" });
  }
  if (file.size > MAX_BYTES) {
    return errorResponse(413, "Photo is over 8 MB.", { reason: "too_large" });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) {
    return errorResponse(400, "Photo file is empty.");
  }

  let pipeline: sharp.Sharp;
  try {
    pipeline = sharp(buf).rotate();
  } catch {
    return errorResponse(400, "Photo is not a supported image.", { reason: "unsupported_format" });
  }

  const outDir = path.join(AVATAR_ROOT, String(riderId));
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outName = `${stamp}.jpg`;
  const outPath = path.join(outDir, outName);

  try {
    // fit: "inside" preserves the user's original framing — sharp's "attention"
    // smart-crop would re-crop on upload and the circle display would crop
    // again, double-trimming faces that sit off-center. Letting the image keep
    // its aspect ratio means the only crop the rider sees is the unavoidable
    // circle clip, which is symmetric.
    await pipeline
      .resize({ width: AVATAR_MAX_DIM, height: AVATAR_MAX_DIM, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .withMetadata({ exif: {} })
      .toFile(outPath);
  } catch (err) {
    console.error("[rider-avatar] sharp processing failed", err);
    return errorResponse(500, "Photo processing failed.");
  }

  try {
    const previous = fs.readdirSync(outDir).filter((f) => f !== outName);
    for (const f of previous) {
      try { fs.unlinkSync(path.join(outDir, f)); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  const relativePath = path.relative(process.cwd(), outPath);
  setRiderAvatarPath(riderId, relativePath);

  const servedAt = Date.now();
  return NextResponse.json({
    ok: true,
    avatarUrl: `${riderAvatarUrl(riderId, relativePath)}?v=${servedAt}`,
    avatarPath: relativePath,
  });
}

export async function DELETE(request: NextRequest) {
  let guarded;
  try {
    guarded = requireRider(request, "access");
  } catch (err) {
    const r = riderGuardErrorResponse(err);
    if (r) return r;
    throw err;
  }
  const riderId = guarded.rider.id;

  const fresh = getRiders().find((r) => r.id === riderId);
  if (!fresh) return errorResponse(404, "Rider not found.");
  const oldAbs = fresh.avatarPath
    ? path.isAbsolute(fresh.avatarPath)
      ? fresh.avatarPath
      : path.join(process.cwd(), fresh.avatarPath)
    : null;
  if (oldAbs) {
    try { fs.unlinkSync(oldAbs); } catch { /* ignore */ }
  }
  setRiderAvatarPath(riderId, "");
  return NextResponse.json({ ok: true });
}