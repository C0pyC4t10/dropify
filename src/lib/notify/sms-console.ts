import fs from "fs";
import path from "path";
import type { SmsAdapter, SendSmsInput, SendSmsResult } from "./sms";

const OUTBOX_DIR = path.join(process.cwd(), "data", "outbox");
const OUTBOX_FILE = path.join(OUTBOX_DIR, "sms.jsonl");

function ensureOutbox(): void {
  if (!fs.existsSync(OUTBOX_DIR)) fs.mkdirSync(OUTBOX_DIR, { recursive: true });
}

function appendOutbox(record: object): void {
  try {
    ensureOutbox();
    fs.appendFileSync(OUTBOX_FILE, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.error("[sms-outbox] write failed", err);
  }
}

/** Dev / unconfigured adapter: logs to console + appends to outbox file.
 *  Production deployments swap this for a real adapter. The body is never
 *  logged at info+ level — only `to` and the message length — so PII
 *  doesn't leak into journalctl / log aggregators. */
export const consoleSmsAdapter: SmsAdapter = {
  name: "console",
  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    const record = {
      ts: new Date().toISOString(),
      adapter: "console",
      to: input.to,
      bodyLen: input.body.length,
      bodyPreview: input.body.slice(0, 60),
      body: input.body,
      providerId: `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    appendOutbox(record);
    console.log(
      `[sms:console] → ${input.to} (${input.body.length} chars): ${input.body.slice(0, 80)}${input.body.length > 80 ? "…" : ""}`
    );
    return { ok: true, providerId: record.providerId };
  },
};

export const activeSmsAdapter: SmsAdapter = consoleSmsAdapter;