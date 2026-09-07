import { NextResponse } from "next/server";
import { getProducts, createProduct } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  return NextResponse.json(getProducts(companyId));
}

export async function POST(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const data = await request.json();
    const product = createProduct(data, companyId);
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}