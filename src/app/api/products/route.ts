import { NextResponse } from "next/server";
import { getProducts, createProduct } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getProducts());
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const product = createProduct(data);
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}