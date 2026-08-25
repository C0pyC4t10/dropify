import { NextResponse } from "next/server";
import { getOrders, createOrder } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getOrders());
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    if (!data.items || data.items.length === 0) {
      return NextResponse.json({ error: "At least one item required" }, { status: 400 });
    }
    const result = createOrder(data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}