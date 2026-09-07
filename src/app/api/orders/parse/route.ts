import { NextResponse } from "next/server";
import { createOrder, getProducts, getCompany } from "@/lib/db";
import { parseOrderFromText, type ParsedOrder, type ParsedOrderItem } from "@/lib/order-parser";
import { getCompanyIdFromRequest } from "@/lib/tenant";

/**
 * POST /api/orders/parse
 *   body options:
 *     (a) { parsed: ParsedOrder, finalItems: [{...productId, qty, unitPrice}] }
 *     (b) { text: string }            ← server parses then creates
 *
 * Returns:
 *   201: { ok: true, order, parsed }  on success
 *   400: { ok: false, error, parsed? } validation failure (parsed returned if available)
 *
 * Always lands in /orders/approval with the operator-selected source
 * (defaults to "manual") and status="pending-approval".
 */
export async function POST(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const company = getCompany(companyId);
    const isBanglaEnabled = company?.slug === "meat";
    const body = await request.json();
    let parsed: ParsedOrder | null = body.parsed || null;
    let finalItems:
      | Array<{ productId?: number | null; matchedProductId?: number | null; quantity?: number; unitPrice?: number | null }>
      | null = body.finalItems || null;

    // If client sent raw text, parse server-side.
    if (!parsed && typeof body.text === "string" && body.text.trim()) {
      const products = getProducts(companyId).map((p) => ({
        id: p.id,
        name: p.name,
        nameBn: p.nameBn,
        sku: p.sku,
        sellPrice: p.sellPrice,
        unit: p.unitCode,
      }));
      parsed = parseOrderFromText({ text: body.text, products }, { isBanglaEnabled });
    }

    if (!parsed) {
      return NextResponse.json({ ok: false, error: "Missing parsed order" }, { status: 400 });
    }
    if (!parsed.customerName || !parsed.customerName.trim()) {
      return NextResponse.json({ ok: false, error: "Customer name required", parsed }, { status: 400 });
    }
    if (!parsed.customerPhone || !parsed.customerPhone.trim()) {
      return NextResponse.json({ ok: false, error: "Phone required", parsed }, { status: 400 });
    }

    // BD-local date used for the MD-{date}-{N} prefix on WP order numbers.
    const bd = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const orderDate = bd.toISOString().slice(0, 10);

    // Filter out empty / qty-zero items. Accept either `productId` or
    // `matchedProductId` so client mistakes don't silently drop rows.
    type _ParsedInput = {
      productId?: number | null;
      matchedProductId?: number | null;
      quantity?: number;
      unitPrice?: number | null;
    };
    const itemsInput: _ParsedInput[] =
      finalItems ||
      parsed.items.map((it: ParsedOrderItem) => ({
        productId: it.matchedProductId,
        matchedProductId: it.matchedProductId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      }));
    const cleanItems = itemsInput
      .filter((it) => {
        if (!it) return false;
        const pid = it.productId ?? it.matchedProductId;
        const qty = Number(it.quantity ?? 0);
        return pid && qty > 0;
      })
      .map((it) => ({
        productId: Number(it.productId ?? it.matchedProductId),
        qty: Number(it.quantity ?? 0),
        unitPrice: Number(it.unitPrice ?? 0),
      }));
    if (cleanItems.length === 0) {
      return NextResponse.json(
        { ok: false, error: "At least one item with productId + qty required", parsed },
        { status: 400 }
      );
    }

    const insideDhaka = parsed.shippingMode === "inside_dhaka";
    const deliveryFee =
      parsed.shippingMode === ""
        ? 0
        : insideDhaka
        ? 100
        : 150;

    const result = createOrder({
      date: new Date().toISOString().slice(0, 10),
      customerId: null,
      customerName: parsed.customerName.trim(),
      customerPhone: parsed.customerPhone.trim(),
      area: parsed.area || "",
      address: parsed.address || "",
      items: cleanItems,
      deliveryFee,
      discount: 0,
      paid: 0,
      paymentMethod: parsed.paymentMethod || "cod",
      source: parsed.source || "manual",
      deliveryMode: "own",
      note: parsed.note || "",
      // Display orderNo uses the MD-{date}-{N} format so list / invoice /
      // approval all read "MD-2026-09-06-30357" instead of bare "30357".
      // wpOrderId keeps the raw WooCommerce id (no MD prefix) so the
      // outbound status-sync to WP keeps matching the id WP knows about.
      wpOrderId:
        (parsed.source || "manual") === "wordpress"
          ? (parsed.orderNo || "").trim()
          : "",
      orderNo:
        (parsed.source || "manual") === "wordpress" && (parsed.orderNo || "").trim()
          ? `MD-${orderDate}-${parsed.orderNo.trim()}`
          : undefined,
      skipStockDeduction: true,
      initialStatus: "pending-approval",
    }, companyId);
    return NextResponse.json(
      { ok: true, order: result.order, parsed: { ...parsed, items: cleanItems } },
      { status: 201 }
    );
  } catch (e) {
    const msg = String(e);
    console.error("[orders/parse] error:", e);
    // Duplicate orderNo from a manual WP paste → 400 with a clean message
    // instead of a generic 500, so the operator can correct it.
    if (/already exists/i.test(msg) && /Order #/i.test(msg)) {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
