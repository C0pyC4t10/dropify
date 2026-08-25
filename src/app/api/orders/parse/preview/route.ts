import { NextResponse } from "next/server";
import { getProducts } from "@/lib/db";
import { parseOrderFromText } from "@/lib/order-parser";

/**
 * POST /api/orders/parse/preview
 *   body: { text: string }
 *   → { parsed: ParsedOrder }     (no order created)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = String(body.text || "");
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "Empty text" }, { status: 400 });
    }
    const products = getProducts().map((p) => ({
      id: p.id,
      name: p.name,
      nameBn: p.nameBn,
      sku: p.sku,
      sellPrice: p.sellPrice,
      unit: p.unit,
    }));
    const parsed = parseOrderFromText({ text, products });
    return NextResponse.json({ ok: true, parsed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
