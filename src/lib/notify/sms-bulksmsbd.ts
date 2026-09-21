import type { SmsAdapter, SendSmsInput, SendSmsResult } from "./sms";

export interface BulksmsBdConfig {
  /** API key from the bulksmsbd.net dashboard. */
  apiKey: string;
  /** Sender ID registered with the carrier — usually a numeric phone
   *  number like 8809648910609. */
  senderId: string;
  /** API base URL. Defaults to the public endpoint. */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 8000. */
  timeoutMs?: number;
}

/** Normalize a Bangladesh phone number to international format (880…).
 *  Accepts: "01712345678", "+8801712345678", "8801712345678", and strips
 *  spaces / dashes / parens. Returns the input unchanged if it doesn't
 *  look Bangladeshi so the API's own validation can surface a useful
 *  error. */
function normalizePhone(input: string): string {
  let n = input.trim().replace(/[\s\-()+]/g, "");
  if (n.startsWith("01")) n = "88" + n;
  // 880XXXXXXXX already international; leave alone.
  return n;
}

/** BulksmsBD (bulksmsbd.net) SMS adapter.
 *
 *  Endpoint shape (GET or POST):
 *    ?api_key=<key>&type=text&number=<intl_phone>&senderid=<sender>&message=<body>
 *
 *  Response — varies between API generations. We accept:
 *    - JSON with `{ status: "success" | "ERROR", sms_id: "..." }`
 *    - JSON with `{ response_code: 202, message_id: "..." }`
 *    - Plain numeric string (the message ID, success)
 *    - Plain text starting with a non-digit (error)
 *
 *  Network/HTTP errors return { ok: false, error } — never throw, per the
 *  SmsAdapter contract. The caller (sms-console.ts selector) decides how
 *  to fall back when this returns ok: false. */
export function createBulksmsBdAdapter(config: BulksmsBdConfig): SmsAdapter {
  const baseUrl = (config.baseUrl ?? "http://bulksmsbd.net/api/smsapi").replace(/\/+$/, "");
  const timeoutMs = config.timeoutMs ?? 8000;

  return {
    name: "bulksmsbd",
    async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
      const number = normalizePhone(input.to);
      const params = new URLSearchParams({
        api_key: config.apiKey,
        type: "text",
        number,
        senderid: config.senderId,
        message: input.body,
      });
      const url = `${baseUrl}?${params.toString()}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { method: "GET", signal: controller.signal });
        const raw = await res.text();

        // First try JSON.
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          // Not JSON — fall through to plain-text handling.
        }

        if (parsed && typeof parsed === "object") {
          const obj = parsed as Record<string, unknown>;
          const status = typeof obj.status === "string" ? obj.status.toLowerCase() : "";
          const code = typeof obj.response_code === "number" ? obj.response_code : null;
          const okByStatus = status === "success" || status === "ok" || status === "sent";
          const okByCode = code === 202 || code === 200;
          if (okByStatus || okByCode) {
            const id = obj.sms_id ?? obj.message_id ?? obj.id ?? raw;
            return { ok: true, providerId: String(id) };
          }
          const errMsg = obj.message ?? obj.error ?? obj.reason ?? raw;
          return { ok: false, error: typeof errMsg === "string" ? errMsg : JSON.stringify(obj) };
        }

        // Plain text. BulksmsBD's older endpoints return the message ID as
        // a bare integer; anything starting with a non-digit is an error.
        const trimmed = raw.trim();
        if (/^\d+$/.test(trimmed)) {
          return { ok: true, providerId: trimmed };
        }
        return { ok: false, error: trimmed || `HTTP ${res.status}` };
      } catch (err) {
        const reason =
          err instanceof Error
            ? err.name === "AbortError"
              ? `timeout after ${timeoutMs}ms`
              : err.message
            : "unknown error";
        return { ok: false, error: reason };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}