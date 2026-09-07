import { NextResponse } from "next/server";
import { deleteUnit, updateUnit } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

/** PATCH /api/units/[id] — edit name / isActive. */
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
    const updated = updateUnit(
      id,
      {
        name: body.name !== undefined ? String(body.name) : undefined,
        isActive:
          typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
      companyId
    );
    if (!updated) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** DELETE /api/units/[id] — soft-delete (products auto-migrate to next active). */
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
    const ok = deleteUnit(id, companyId);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Unit not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
