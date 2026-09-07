import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/tenant-constants";

/**
 * POST /api/admin/companies/[id]/switch — set the active tenant.
 * Mirrors PUT /api/companies but is namespaced under /admin so the action is
 * discoverable from the company-detail page.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }
  const store = await cookies();
  store.set(ACTIVE_COMPANY_COOKIE, String(id), {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
  });
  return NextResponse.json({ ok: true, activeCompanyId: id });
}
