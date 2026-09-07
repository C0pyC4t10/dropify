import { NextResponse } from "next/server";
import { getOrders, createOrder } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  return NextResponse.json(getOrders(companyId));
}

export async function POST(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const data = await request.json();
    if (!data.items || data.items.length === 0) {
      return NextResponse.json({ error: "At least one item required" }, { status: 400 });
    }
    const result = createOrder(data, companyId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}