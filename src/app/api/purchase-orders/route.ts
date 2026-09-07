import { NextResponse } from "next/server";
import { getPurchaseOrders, createPurchaseOrder } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  return NextResponse.json(getPurchaseOrders(companyId));
}

export async function POST(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const data = await request.json();
    if (!data.items || data.items.length === 0) {
      return NextResponse.json({ error: "At least one item required" }, { status: 400 });
    }
    const po = createPurchaseOrder(data, companyId);
    return NextResponse.json(po, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}