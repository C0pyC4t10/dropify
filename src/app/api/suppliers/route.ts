import { NextResponse } from "next/server";
import { getSuppliers, createSupplier } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getSuppliers());
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const supplier = createSupplier(data);
    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}