import { NextResponse } from "next/server";
import { createCategory, getCategories } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

/** GET /api/categories — list active categories for the active tenant. */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  const url = new URL(request.url);
  const includeInactive = url.searchParams.get("includeInactive") === "1";
  return NextResponse.json(getCategories(companyId, { includeInactive }));
}

/** POST /api/categories — create a new category in the active tenant. */
export async function POST(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const body = await request.json();
    const category = createCategory(
      {
        slug: String(body.slug ?? ""),
        name: String(body.name ?? ""),
        description: body.description !== undefined ? String(body.description) : undefined,
        sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
      },
      companyId
    );
    return NextResponse.json(category, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
