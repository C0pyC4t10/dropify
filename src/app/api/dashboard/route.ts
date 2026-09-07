import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  return NextResponse.json(getDashboard(companyId));
}