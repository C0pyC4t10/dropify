import { NextResponse, type NextRequest } from "next/server";
import fs from "fs";
import { getRiders } from "@/lib/db";
import { resolveRiderAvatarPath } from "@/lib/rider-avatar";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params;
  const riderId = Number(idParam);
  if (!Number.isInteger(riderId) || riderId <= 0) {
    return NextResponse.json({ error: "Invalid rider id." }, { status: 400 });
  }
  const rider = getRiders().find((r) => r.id === riderId);
  if (!rider) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  // Don't serve avatars of deactivated / suspended accounts.
  if (rider.accountStatus !== "active") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const filePath = resolveRiderAvatarPath(riderId, rider.avatarPath);
  if (!filePath) {
    return NextResponse.json({ error: "No avatar." }, { status: 404 });
  }
  const buf = await fs.promises.readFile(filePath);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=300",
      "Content-Length": String(buf.length),
    },
  });
}