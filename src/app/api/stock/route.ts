import { NextResponse } from "next/server";
import { adjustStock, getStockMovements } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const movements = getStockMovements(
    companyId,
    productId ? Number(productId) : undefined
  );
  return NextResponse.json(movements);
}

export async function POST(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const { productId, type, qty, note } = await request.json();
    if (!productId || !type || !qty) {
      return NextResponse.json({ error: "productId, type and qty required" }, { status: 400 });
    }
    const product = adjustStock(productId, type, qty, note || "", companyId);
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}