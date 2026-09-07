import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  getSettings,
  getProducts,
  createProduct,
  createOrder,
  findPendingOrderByWpId,
  approveOrder,
  getCompanies,
  getCategories,
  getUnits,
} from "@/lib/db";
import type { PaymentMethod } from "@/lib/types";

async function hmacBase64(secret: string, body: string): Promise<string> {
  return crypto.createHmac("sha256", secret).update(body, "utf-8").digest("base64");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "base64"), Buffer.from(b, "base64"));
  } catch {
    return false;
  }
}

interface WpItem {
  sku?: string;
  name?: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

interface WpPayload {
  wpOrderId: string | number;
  customerName: string;
  customerPhone: string;
  area?: string;
  address?: string;
  items: WpItem[];
  subtotal?: number;
  deliveryFee?: number;
  discount?: number;
  total?: number;
  paid?: number;
  paymentMethod?: string;
  note?: string;
  date?: string;
}

const ALLOWED_PAYMENT_METHODS: PaymentMethod[] = ["cod", "bkash", "nagad", "card", "advance"];

function normalizePaymentMethod(s: string | undefined): PaymentMethod {
  const v = (s || "").toLowerCase().trim();
  return (ALLOWED_PAYMENT_METHODS as string[]).includes(v)
    ? (v as PaymentMethod)
    : "cod";
}

/**
 * Inbound webhook from WordPress (WooCommerce).
 *
 *   POST /api/webhooks/wordpress
 *   Headers:
 *     X-Webhook-Secret: <matches Settings.wpWebhookSecret>
 *     Content-Type: application/json
 *   Body: WpPayload (see above)
 *
 * Behavior:
 *   - 401 if secret is missing/mismatched.
 *   - 422 if any SKU can't be resolved to a product.
 *   - 200 with the existing order if this wpOrderId was already received
 *     (dedupe retries).
 *   - Otherwise creates the order with status="pending-approval",
 *     stockDeducted=false, source="wordpress". The order won't deduct stock
 *     until /orders/approval approves it.
 *   - If Settings.wpAutoApprove is true, also flips it to "new" immediately
 *     (after deducting stock).
 */
export async function POST(request: Request) {
  // Buffer the body first so we can verify HMAC + parse JSON downstream.
  const rawBody = await request.text();
  const plainSecret = request.headers.get("x-webhook-secret") || "";
  const wcSignature = request.headers.get("x-wc-webhook-signature") || "";

  console.log("[wp-webhook] incoming request");
  console.log("[wp-webhook]   X-Webhook-Secret       =", JSON.stringify(plainSecret));
  console.log("[wp-webhook]   X-WC-Webhook-Signature =", JSON.stringify(wcSignature));
  console.log("[wp-webhook]   body[0..200]           =", rawBody.slice(0, 200));

  // 1. Resolve company from the inbound secret. Each company has its own
  //    wpWebhookSecret; we walk every active company and pick the one whose
  //    secret matches the static header OR whose stored secret produces the
  //    same HMAC as the WC signature on this body. Once a company is matched
  //    we verify the signature against THAT company's secret and proceed.
  const companies = getCompanies();
  let matchedCompanyId: number | null = null;
  for (const c of companies) {
    let settings;
    try {
      settings = getSettings(c.id);
    } catch {
      continue;
    }
    if (!settings.wpWebhookSecret) continue;

    // Plain shared secret — direct equality.
    if (plainSecret && plainSecret === settings.wpWebhookSecret) {
      matchedCompanyId = c.id;
      break;
    }
    // WooCommerce HMAC.
    if (wcSignature) {
      const expected = await hmacBase64(settings.wpWebhookSecret, rawBody);
      if (timingSafeEqual(expected, wcSignature)) {
        matchedCompanyId = c.id;
        break;
      }
    }
  }

  if (matchedCompanyId == null) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid webhook secret. Set X-Webhook-Secret or X-WC-Webhook-Signature.",
      },
      { status: 401 }
    );
  }
  const companyId = matchedCompanyId;
  let settings;
  try {
    settings = getSettings(companyId);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Settings not configured: " + String(e) },
      { status: 500 }
    );
  }
  if (!settings.wpWebhookSecret) {
    return NextResponse.json(
      { ok: false, error: "wpWebhookSecret not set in settings." },
      { status: 503 }
    );
  }

  // 2. Parse and validate payload.
  let payload: WpPayload;
  try {
    payload = JSON.parse(rawBody) as WpPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false, error: "Body must be a JSON object." }, { status: 400 });
  }
  const wpOrderId = String(payload.wpOrderId ?? "").trim();
  if (!wpOrderId) {
    console.log("[wp-webhook] 400: missing wpOrderId. rawBody=", rawBody);
    return NextResponse.json({ ok: false, error: "wpOrderId is required." }, { status: 400 });
  }
  if (!payload.customerName || !payload.customerPhone) {
    console.log("[wp-webhook] 400: missing customer. rawBody=", rawBody);
    return NextResponse.json(
      { ok: false, error: "customerName and customerPhone are required." },
      { status: 400 }
    );
  }
  if (!Array.isArray(payload.items)) {
    console.log("[wp-webhook] 400: items not array. rawBody=", rawBody);
    return NextResponse.json({ ok: false, error: "items must be an array." }, { status: 400 });
  }
  if (payload.items.length === 0) {
    // Allow empty item lists (admin-created orders, custom checkouts) — accept
    // and let createOrder handle it. Stock impact is 0 anyway.
    console.log("[wp-webhook] note: 0 items in payload, accepting anyway");
  }

  // 3. Dedupe: if this WP order is already pending, return it.
  const existing = findPendingOrderByWpId(wpOrderId, companyId);
  if (existing) {
    return NextResponse.json(
      {
        ok: true,
        deduplicated: true,
        orderId: existing.id,
        orderNo: existing.orderNo,
        message: "Order was already received; returning existing row.",
      },
      { status: 200 }
    );
  }

  // 4. Resolve SKUs to product IDs — match by SKU, then by English name, then
  //    by Bengali name, then auto-create products for unknowns so orders never
  //    get blocked by catalog drift between WP and our app.
  const products = getProducts(companyId);
  const skuMap = new Map(products.map((p) => [p.sku.toLowerCase(), p]));
  const nameMap = new Map<string, typeof products[number]>();
  const nameBnMap = new Map<string, typeof products[number]>();
  for (const p of products) {
    if (p.name) nameMap.set(p.name.toLowerCase().trim(), p);
    if (p.nameBn) nameBnMap.set(p.nameBn.toLowerCase().trim(), p);
  }
  const resolvedItems: Array<{ productId: number; qty: number; unitPrice: number }> = [];
  for (const it of payload.items) {
    const rawSku = String(it.sku || "").trim();
    const wpName = String(it.name || "").trim();
    // Try matching in order: SKU, then English name, then Bengali name.
    let product = skuMap.get(rawSku.toLowerCase());
    if (!product && wpName) product = nameMap.get(wpName.toLowerCase());
    if (!product && wpName) product = nameBnMap.get(wpName.toLowerCase());

    if (!product) {
      // No match — auto-create a product with the WP item's name so future
      // orders with the same product name still match (it'll fall into the
      // name map on the next save).
      const wpNameOnly = String(it.name || "").trim();
      const isBengaliName = /[\u0980-\u09FF]/.test(wpNameOnly);
      const displayEn = isBengaliName
        ? "" // don't dump Bengali into English name field
        : (wpNameOnly || rawSku || `WP Product ${it.qty}${it.unit}`);
      const displayBn = isBengaliName
        ? wpNameOnly
        : ""; // English-only product has no Bangla name
      const autoSku = rawSku || ("WP-" + Date.now() + "-" + Math.floor(Math.random() * 1000));
      try {
        // Use the tenant's first active category + first active unit
        // instead of hard-coded meat values — works for any vertical.
        const tenantCategories = getCategories(companyId);
        const tenantUnits = getUnits(companyId);
        const fallbackCategoryId = tenantCategories[0]?.id;
        const fallbackUnitId =
          tenantUnits.find((u) => u.code === (it.unit || "").toLowerCase())?.id ??
          tenantUnits[0]?.id;
        if (!fallbackCategoryId || !fallbackUnitId) {
          throw new Error(
            "Tenant has no categories or units configured. Set them up in /admin first."
          );
        }
        const created = createProduct({
          sku: autoSku,
          name: displayEn,
          nameBn: displayBn,
          categoryId: fallbackCategoryId,
          unitId: fallbackUnitId,
          costPrice: Number(it.unitPrice) || 0,
          sellPrice: Number(it.unitPrice) || 0,
          marketPrice: Number(it.unitPrice) || 0,
          stockQty: 0,
          reorderLevel: 5,
        } as Parameters<typeof createProduct>[0], companyId);
        product = created;
        skuMap.set(created.sku.toLowerCase(), created);
        if (created.name) nameMap.set(created.name.toLowerCase(), created);
        if (created.nameBn) nameBnMap.set(created.nameBn.toLowerCase(), created);
        console.log(`[wp-webhook] auto-created product: sku="${created.sku}" en="${created.name}" bn="${created.nameBn}"`);
      } catch (e) {
        console.log(`[wp-webhook] auto-create failed for sku="${autoSku}":`, String(e));
        return NextResponse.json(
          { ok: false, error: `Could not create product for SKU: "${rawSku}"`, detail: String(e) },
          { status: 422 }
        );
      }
    }
    resolvedItems.push({
      productId: product.id,
      qty: Number(it.qty) || 0,
      unitPrice: Number(it.unitPrice) || 0,
    });
  }

  // 5. Create the order in pending-approval with stock NOT deducted.
  let result;
  try {
    result = createOrder({
      date: payload.date || new Date().toISOString().slice(0, 10),
      customerId: null,
      customerName: String(payload.customerName),
      customerPhone: String(payload.customerPhone),
      area: String(payload.area || ""),
      address: String(payload.address || ""),
      items: resolvedItems,
      deliveryFee: Number(payload.deliveryFee) || 0,
      discount: Number(payload.discount) || 0,
      paid: Number(payload.paid) || 0,
      paymentMethod: normalizePaymentMethod(payload.paymentMethod),
      source: "wordpress",
      deliveryMode: "own",
      note: String(payload.note || ""),
      wpOrderId,
      skipStockDeduction: true,
      initialStatus: "pending-approval",
    }, companyId);
  } catch (e) {
    return NextResponse.json({ ok: false, error: "createOrder failed: " + String(e) }, { status: 500 });
  }

  // 6. Optional auto-approve.
  if (settings.wpAutoApprove) {
    try {
      approveOrder(result.order.id, companyId);
    } catch (e) {
      // Surface the error in the response but still return the order.
      return NextResponse.json(
        {
          ok: true,
          autoApproveError: String(e),
          orderId: result.order.id,
          orderNo: result.order.orderNo,
        },
        { status: 201 }
      );
    }
    return NextResponse.json(
      { ok: true, autoApproved: true, orderId: result.order.id, orderNo: result.order.orderNo },
      { status: 201 }
    );
  }

  return NextResponse.json(
    { ok: true, orderId: result.order.id, orderNo: result.order.orderNo },
    { status: 201 }
  );
}

// Reachability probe — WP's webhook admin sends a HEAD/GET to verify the URL
// is alive before saving. We accept it as a 200 OK with no auth required so
// the URL passes the validation step.
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      message: "Dropify WP webhook endpoint reachable. POST with X-Webhook-Secret to send orders.",
    },
    { status: 200 }
  );
}
