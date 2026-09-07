import type { Order, Settings } from "./types";

/**
 * Map a Dropify order status to the equivalent WooCommerce order status.
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
 * to match the Dropify order status. No-op if WP integration is disabled, the
 * site URL is missing, or the order has no wpOrderId. Failures are logged to
 * the server console but never thrown (so they don't break calling flows).
 *
 * The body field `bazareyOrderId` / `bazareyOrderNo` are kept under their
 * legacy names for backward-compat with the existing WordPress MU-plugin
 * (`docs/wp-mu-plugin/bazarey-sync.php`). New WP integrations should use
 * the `dropifyOrder*` aliases added in this revision.
 */
export async function pushStatusToWoo(order: Order): Promise<void> {
  const settings = resolveSettingsForOrder(order);
  if (!settings) return;
  if (!settings.wpOutboundEnabled) return;
  if (!settings.wpSiteUrl) return;
  if (!order.wpOrderId) return;

  const url = `${settings.wpSiteUrl.replace(/\/+$/, "")}/wp-json/dropify-sync/v1/status`;
  const body = JSON.stringify({
    wpOrderId: order.wpOrderId,
    status: mapOrderStatusToWoo(order.status),
    dropifyOrderId: order.id,
    dropifyOrderNo: order.orderNo,
    // Legacy field names retained for the v1 WP plugin.
    bazareyOrderId: order.id,
    bazareyOrderNo: order.orderNo,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Dropify-Secret": settings.wpWebhookSecret,
        // Legacy header kept so the existing WP plugin still authenticates
        // until operators roll out the new MU-plugin.
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

/**
 * Resolve the per-order settings. We used to call `getSettings()` with no
 * arg, which leaked the meat company's wpWebhookSecret to every other
 * tenant's outbound sync — a serious cross-tenant credential leak. Now we
 * scope the read to the order's own companyId.
 */
function resolveSettingsForOrder(order: Order): Settings | null {
  // Lazy-import to avoid pulling the DB layer into client bundles.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getSettings } = require("./db") as typeof import("./db");
  try {
    return getSettings(order.companyId);
  } catch {
    return null;
  }
}
