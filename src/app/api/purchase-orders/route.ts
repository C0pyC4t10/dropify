import { NextResponse } from "next/server";
import { getPurchaseOrders, createPurchaseOrder } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getPurchaseOrders());
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    if (!data.items || data.items.length === 0) {
      return NextResponse.json({ error: "At least one item required" }, { status: 400 });
    }
    const po = createPurchaseOrder(data);
    return NextResponse.json(po, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}