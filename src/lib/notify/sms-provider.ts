/**
 * SMS provider selector — picks the right adapter at module-load time
 * based on the runtime environment:
 *
 *   BULKSMSBD_API_KEY + BULKSMSBD_SENDER_ID set → BulksmsBD (real SMS)
 *   otherwise                                    → console adapter
 *                                                  (logs + data/outbox/sms.jsonl)
 *
 * Both adapters satisfy SmsAdapter and never throw on network failure —
 * they return { ok: false, error }. The caller (the OTP request route)
 * surfaces that as a friendly error to the rider and continues with the
 * existing POD row, so a transient SMS outage doesn't block delivery.
 */

import type { SmsAdapter } from "./sms";
import { consoleSmsAdapter } from "./sms-console";
import { createBulksmsBdAdapter } from "./sms-bulksmsbd";

function selectAdapter(): SmsAdapter {
  const apiKey = process.env.BULKSMSBD_API_KEY;
  const senderId = process.env.BULKSMSBD_SENDER_ID;
  if (apiKey && senderId) {
    return createBulksmsBdAdapter({
      apiKey,
      senderId,
      baseUrl: process.env.BULKSMSBD_URL,
      timeoutMs: process.env.BULKSMSBD_TIMEOUT_MS
        ? Number(process.env.BULKSMSBD_TIMEOUT_MS)
        : undefined,
    });
  }
  return consoleSmsAdapter;
}

/** The active adapter. Resolved once at module load. */
export const activeSmsAdapter: SmsAdapter = selectAdapter();

/** Direct accessor to the console adapter (always available, regardless
 *  of env vars) — useful for tests and admin tools that want to force
 *  the console adapter. */
export { consoleSmsAdapter } from "./sms-console";
export { createBulksmsBdAdapter } from "./sms-bulksmsbd";