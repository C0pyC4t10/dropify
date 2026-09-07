import { NextResponse } from "next/server";
import { deleteCategory, updateCategory } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

/** PATCH /api/categories/[id] — edit name / description / sortOrder / isActive. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = await request.json();
    const updated = updateCategory(
      id,
      {
        name: body.name !== undefined ? String(body.name) : undefined,
        description:
          body.description !== undefined ? String(body.description) : undefined,
        sortOrder:
          typeof body.sortOrder === "number" ? body.sortOrder : undefined,
        isActive:
          typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
      companyId
    );
    if (!updated) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** DELETE /api/categories/[id] — soft-delete (products auto-migrate). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }
    const ok = deleteCategory(id, companyId);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Category not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
