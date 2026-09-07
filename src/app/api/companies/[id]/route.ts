import { NextResponse } from "next/server";
import { updateCompany } from "@/lib/db";

/**
 * PATCH /api/companies/[id] — edit name / tagline / logoUrl / accentColor / isActive.
 * Slug is intentionally immutable.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = await request.json();
    const updated = updateCompany(id, {
      name: body.name !== undefined ? String(body.name) : undefined,
      tagline: body.tagline !== undefined ? String(body.tagline) : undefined,
      logoUrl: body.logoUrl !== undefined ? String(body.logoUrl) : undefined,
      accentColor: body.accentColor !== undefined ? String(body.accentColor) : undefined,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
    });
    if (!updated) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
