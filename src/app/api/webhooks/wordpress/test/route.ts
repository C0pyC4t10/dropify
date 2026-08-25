import { NextResponse } from "next/server";
import { getSettings, getProducts } from "@/lib/db";

/**
 * POST /api/webhooks/wordpress/test
 *   body: {
 *     wpOrderId?: string,  // default: "TEST-" + Date.now()
 *     sku?: string,        // default: first product's SKU
 *     qty?: number,        // default: 1
 *     customerName?: string,
 *     customerPhone?: string,
 *   }
 *
 * Convenience wrapper that injects a valid X-Webhook-Secret and the first
 * available SKU so you can simulate a WordPress order arriving without an
 * actual WP site running.
 */
export async function POST(request: Request) {
  let settings;
  try {
    settings = getSettings();
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Settings missing: " + String(e) }, { status: 500 });
  }
  if (!settings.wpWebhookSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: "wpWebhookSecret not set in /settings. Configure it first, then retry.",
      },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const products = getProducts();
  if (products.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No products in catalog — create at least one first." },
      { status: 400 }
    );
  }
  const sku = (body.sku || "").toString() || products[0].sku;
  const product = products.find((p) => p.sku === sku);
  if (!product) {
    return NextResponse.json(
      { ok: false, error: `SKU "${sku}" not found in catalog.` },
      { status: 400 }
    );
  }
  const payload = {
    wpOrderId: body.wpOrderId || `TEST-${Date.now()}`,
    customerName: body.customerName || "Test Customer",
    customerPhone: body.customerPhone || "01700000000",
    area: body.area || "Aftabnagar",
    address: body.address || "Test Address",
    items: [
      {
        sku: product.sku,
        qty: body.qty || 1,
        unitPrice: body.unitPrice || product.sellPrice,
      },
    ],
    subtotal: (body.qty || 1) * (body.unitPrice || product.sellPrice),
    deliveryFee: body.deliveryFee ?? settings.deliveryCharge,
    discount: 0,
    total:
      (body.qty || 1) * (body.unitPrice || product.sellPrice) +
      (body.deliveryFee ?? settings.deliveryCharge),
    paid: 0,
    paymentMethod: body.paymentMethod || "cod",
    note: body.note || "",
    date: new Date().toISOString().slice(0, 10),
  };

  // Re-route: actually call our own inbound webhook with the right secret.
  const origin = new URL(request.url).origin;
  const res = await fetch(`${origin}/api/webhooks/wordpress`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": settings.wpWebhookSecret,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return NextResponse.json(
    { ok: res.ok, simulatedPayload: payload, response: data },
    { status: res.status }
  );
}
