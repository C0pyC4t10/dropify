import { NextResponse } from "next/server";
import { createUnit, getUnits } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

/** GET /api/units — list active units for the active tenant. */
export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  const url = new URL(request.url);
  const includeInactive = url.searchParams.get("includeInactive") === "1";
  return NextResponse.json(getUnits(companyId, { includeInactive }));
}

/** POST /api/units — create a new unit in the active tenant. */
export async function POST(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const body = await request.json();
    const unit = createUnit(
      {
        code: String(body.code ?? ""),
        name: String(body.name ?? ""),
      },
      companyId
    );
    return NextResponse.json(unit, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
