/**
 * Shared auth check for admin-side rider management endpoints. The Dropify
 * admin console uses a soft cookie gate (`dropify_admin_mode` cookie set
 * when the operator clicks "unlock"); these endpoints honor the same gate
 * so a logged-out dispatcher terminal can't reset a rider's PIN by hitting
 * the route directly. When the platform adds real RBAC, swap this for the
 * proper auth helper.
 */
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_COOKIE = "dropify_admin_mode";

export function requireAdminCookie(request: NextRequest): NextResponse | null {
  const v = request.cookies.get(ADMIN_COOKIE)?.value;
  if (v === "1") return null;
  return NextResponse.json({ ok: false, error: "Admin mode required." }, { status: 401 });
}