import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  return NextResponse.json(getSettings(companyId));
}

export async function PUT(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const data = await request.json();
    const settings = updateSettings(data, companyId);
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}