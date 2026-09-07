import { NextResponse } from "next/server";
import { getSuppliers, createSupplier } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  return NextResponse.json(getSuppliers(companyId));
}

export async function POST(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const data = await request.json();
    const supplier = createSupplier(data, companyId);
    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}