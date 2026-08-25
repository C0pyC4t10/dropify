import { getSettings } from "./db";
import type { Order } from "./types";

/**
 * Map a Bazarey order status to the equivalent WooCommerce order status.
 *   pending-approval → on-hold   (waits for ops to approve in /orders/approval)
 *   new              → processing
 *   confirmed        → processing
 *   preparing        → processing
 *   out-for-delivery → shipped
 *   delivered        → completed
 *   cancelled        → cancelled
 */
function mapOrderStatusToWoo(status: Order["status"]): string {
  switch (status) {
    case "pending-approval":
      return "on-hold";
    case "new":
    case "confirmed":
    case "preparing":
      return "processing";
    case "out-for-delivery":
      return "shipped";
    case "delivered":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return "processing";
  }
}

/**
 * Fire-and-forget POST to WordPress that updates the WooCommerce order status
 * to match the Bazarey order status. No-op if WP integration is disabled, the
 * site URL is missing, or the order has no wpOrderId. Failures are logged to
 * the server console but never thrown (so they don't break calling flows).
 */
export async function pushStatusToWoo(order: Order): Promise<void> {
  // Outbound toggle check.
  let settings;
  try {
    settings = getSettings();
  } catch {
    return;
  }
  if (!settings.wpOutboundEnabled) return;
  if (!settings.wpSiteUrl) return;
  if (!order.wpOrderId) return;

  const url = `${settings.wpSiteUrl.replace(/\/+$/, "")}/wp-json/bazarey-sync/v1/status`;
  const body = JSON.stringify({
    wpOrderId: order.wpOrderId,
    status: mapOrderStatusToWoo(order.status),
    bazareyOrderId: order.id,
    bazareyOrderNo: order.orderNo,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bazarey-Secret": settings.wpWebhookSecret,
      },
      body,
      // Keep this snappy — if WP is slow, don't block our DB write flow.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(
        `[wp-sync] POST ${url} → ${res.status} for order #${order.id}`
      );
    }
  } catch (e) {
    console.warn(`[wp-sync] failed for order #${order.id}:`, String(e));
  }
}
