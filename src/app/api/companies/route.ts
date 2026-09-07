import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createCompany, getCompanies } from "@/lib/db";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/tenant-constants";

/**
 * GET /api/companies
 *
 * Lists every active company so the header switcher can render a dropdown.
 * Inactive companies are hidden (callers can still resolve them via
 * getCompany(id) server-side if needed).
 */
export async function GET() {
  return NextResponse.json(getCompanies());
}

/**
 * POST /api/companies — create a new company + initial empty settings row.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const company = createCompany({
      slug: String(body.slug ?? ""),
      name: String(body.name ?? ""),
      tagline: String(body.tagline ?? ""),
      logoUrl: String(body.logoUrl ?? ""),
      accentColor: String(body.accentColor ?? ""),
      seedVertical: typeof body.seedVertical === "string" ? body.seedVertical : "none",
    });
    return NextResponse.json(company, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

/**
 * PUT /api/companies — switch the active company.
 *
 * Body: { id: number }. Sets the `active_company_id` cookie.
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid company id" }, { status: 400 });
    }
    // Verify the company exists.
    const found = getCompanies().find((c) => c.id === id);
    if (!found) {
      return NextResponse.json({ error: "Company not found or inactive" }, { status: 404 });
    }
    const store = await cookies();
    store.set(ACTIVE_COMPANY_COOKIE, String(id), {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });
    return NextResponse.json({ ok: true, activeCompanyId: id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
