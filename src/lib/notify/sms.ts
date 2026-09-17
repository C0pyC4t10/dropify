/**
 * SMS adapter — pluggable gateway for rider OTP delivery.
 *
 * The real provider (BulkSMSBD / SSL / Twilio / etc.) is NOT wired up yet.
 * Until it is, the default `consoleSmsAdapter` just logs the message to
 * stdout AND writes it to `data/outbox/sms.jsonl` so the rider flow works
 * end-to-end in dev without a live gateway. When you paste the real API
 * shape, drop in `bulkSmsBdAdapter` (or whichever) and switch the export.
 *
 * Every adapter must satisfy:
 *   - `sendSms(to, body)` returns a `{ ok, providerId?, error? }` envelope
 *   - never throws on network failures (return `{ ok: false, error }`)
 *   - never logs the SMS body to application logs at info+ level (PII)
 */

export interface SendSmsInput {
  to: string;
  body: string;
}

export interface SendSmsResult {
  ok: boolean;
  providerId?: string;
  error?: string;
}

export interface SmsAdapter {
  readonly name: string;
  sendSms(input: SendSmsInput): Promise<SendSmsResult>;
}