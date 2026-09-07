import { NextResponse } from "next/server";
import { getProducts, getCompany } from "@/lib/db";
import { parseOrderFromText } from "@/lib/order-parser";
import { getCompanyIdFromRequest } from "@/lib/tenant";

/**
 * POST /api/orders/parse/preview
 *   body: { text: string }
 *   → { parsed: ParsedOrder }     (no order created)
 */
export async function POST(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const company = getCompany(companyId);
    const isBanglaEnabled = company?.slug === "meat";
    const body = await request.json();
    const text = String(body.text || "");
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "Empty text" }, { status: 400 });
    }
    const products = getProducts(companyId).map((p) => ({
      id: p.id,
      name: p.name,
      nameBn: p.nameBn,
      sku: p.sku,
      sellPrice: p.sellPrice,
      unit: p.unitCode,
    }));
    const parsed = parseOrderFromText({ text, products }, { isBanglaEnabled });
    return NextResponse.json({ ok: true, parsed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
