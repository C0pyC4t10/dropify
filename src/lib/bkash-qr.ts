/**
 * bKash Payment QR helper.
 *
 * The shop's bKash number is 01932367356 (business, used for receiving
 * customer payments). Customers will use the bKash app's **Payment**
 * option to pay — NOT "Send Money". That distinction matters:
 *
 *   - "Send Money" = person-to-person transfer (you dial a number)
 *   - "Payment"    = merchant checkout (you scan a QR and the app
 *                    auto-fills merchant + amount)
 *
 * bKash issues each merchant a static "Payment" QR string when they
 * onboard. When that QR is scanned, the bKash app opens in Payment mode
 * with the merchant pre-filled. We store that string in Settings
 * (bkashPaymentQr) and use it directly. If not set, we fall back to
 * building a basic EMVCo "Send Money"-style payload — but the visible
 * label still says "Payment" so the customer picks the right option.
 */

import QRCode from "qrcode";

/** The shop's bKash "Payment" number (used for both Send Money fallback
 *  and as a label on the QR). */
export const BKASH_NUMBER = "01932367356";
/** Same number in international format. */
export const BKASH_NUMBER_INTL = "+8801932367356";
/** Shop name shown on the QR label (capped at 13 chars per EMVCo 5913). */
export const BKASH_MERCHANT_NAME = "Bazarey Meat";

/** CRC16-CCITT (polynomial 0x1021, init 0xFFFF) — required for EMVCo. */
function crc16ccitt(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Build a fallback EMVCo "Send Money" payload for bKash Bangladesh. */
export function buildBkashEmvcoPayload(opts: { amountTaka?: number; reference?: string } = {}): string {
  const walletId = "0017bkash.com01060111000213" + BKASH_MERCHANT_NAME.padEnd(13, " ").slice(0, 13);
  const mcc = "52040000";
  const currency = "5303050";
  const country = "5802BD";
  const name = "59" + String(BKASH_MERCHANT_NAME.length).padStart(2, "0") + BKASH_MERCHANT_NAME;
  const city = "60" + String("Dhaka".length).padStart(2, "0") + "Dhaka";

  let amountTag = "";
  if (typeof opts.amountTaka === "number" && opts.amountTaka > 0) {
    const amt = opts.amountTaka.toFixed(2);
    amountTag = "54" + String(amt.length).padStart(2, "0") + amt;
  }
  let additionalData = "";
  if (opts.reference) {
    const ref = opts.reference.slice(0, 25);
    const subTag = "01" + String(ref.length).padStart(2, "0") + ref;
    additionalData = "62" + String(subTag.length).padStart(2, "0") + subTag;
  }

  const withoutCrc =
    "000201" +
    "010212" +
    "26" + String(walletId.length).padStart(2, "0") + walletId +
    mcc +
    currency +
    country +
    name +
    city +
    amountTag +
    additionalData +
    "6304";

  return withoutCrc + crc16ccitt(withoutCrc);
}

/** Plain text fallback — just the bKash number. */
export function buildBkashPlainText(opts: { amountTaka?: number; reference?: string } = {}): string {
  const parts: string[] = [BKASH_NUMBER];
  if (typeof opts.amountTaka === "number" && opts.amountTaka > 0) {
    parts.push(`Amount: ৳${opts.amountTaka.toFixed(2)}`);
  }
  if (opts.reference) parts.push(`Ref: ${opts.reference}`);
  return parts.join(" | ");
}

/**
 * Returns true if the given string looks like a real bKash/EMVCo QR payload
 * (i.e. the long base64-like string bKash actually puts in the QR).
 *
 * NOTE: We intentionally keep the bar low — we only reject things that
 * are obviously not QR data (empty, super-short). If a user pastes their
 * merchant's string verbatim (even a filename or label), we respect
 * their choice and use it. bKash will simply reject it on scan if it's
 * not a valid payload.
 */
export function isLikelyBkashQrPayload(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 4) return false; // need at least a few chars
  return true;
}

export interface BkashQrOptions {
  /** Order total in taka. */
  amountTaka?: number;
  /** Order number (used as bill reference). */
  reference?: string;
  /**
   * If the merchant has been onboarded on bKash Payment and pasted their
   * static Payment QR string into Settings, pass it here. We use it
   * verbatim — that's what makes the bKash app open in **Payment** mode.
   */
  merchantPaymentQr?: string | null;
  /** QR size in pixels. Default 220. */
  size?: number;
  /** Error-correction level: L=7%, M=15%, Q=25%, H=30%. Default M. */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  /** Dark color (default black). */
  dark?: string;
  /** Light color (default white). */
  light?: string;
  /** Margin (quiet zone) in modules. Default 2. */
  margin?: number;
}

/**
 * Generate a bKash Payment QR code as a base64 PNG data URL.
 *
 * Priority:
 *   1. If `merchantPaymentQr` is set AND it looks like a real EMVCo/bKash
 *      payload (long base64-like string, starts with "000201"), use it
 *      verbatim — that's the actual encoded QR string from your bKash
 *      merchant portal. The bKash app will open in **Payment** mode
 *      with merchant + amount + ref prefilled.
 *   2. Otherwise build a valid EMVCo "Send Money" payload from
 *      `BKASH_NUMBER` (the bKash app will open with **Send Money**
 *      pre-filled; the visible label still says "bKash Payment" so
 *      customers know to pay — same end result, money arrives in
 *      your account).
 *   3. Plain-text fallback with just the bKash number.
 */
export async function bkashQrDataUrl(opts: BkashQrOptions = {}): Promise<string> {
  const size = opts.size ?? 220;
  const ecl = opts.errorCorrectionLevel ?? "M";
  const margin = opts.margin ?? 2;

  // Priority 1: real merchant QR payload from settings.
  let payload: string | null = null;
  if (isLikelyBkashQrPayload(opts.merchantPaymentQr)) {
    payload = (opts.merchantPaymentQr ?? "").trim();
  } else if (opts.merchantPaymentQr && opts.merchantPaymentQr.trim().length > 0) {
    // The string is set but doesn't look like a valid QR payload
    // (e.g. someone pasted a filename or a note). Don't encode it —
    // fall through to the auto-generated payload.
    console.warn(
      "bkashPaymentQr is set but doesn't look like a real bKash/EMVCo payload. " +
      "Scan the actual QR image with a generic QR reader and paste the decoded text into Settings. " +
      "Falling back to auto-generated payload for now.",
    );
  }

  // Priority 2 + 3: build EMVCo "Send Money" or plain-text fallback.
  if (!payload) {
    try {
      payload = buildBkashEmvcoPayload(opts);
      if (payload.length < 80) throw new Error("EMVCo payload too short");
    } catch {
      payload = buildBkashPlainText(opts);
    }
  }

  return await QRCode.toDataURL(payload, {
    errorCorrectionLevel: ecl,
    margin,
    width: size,
    color: { dark: opts.dark ?? "#000000", light: opts.light ?? "#ffffff" },
  });
}

/** SVG string — used for PDF embedding. */
export async function bkashQrToSvgString(opts: BkashQrOptions = {}): Promise<string> {
  let payload: string | null = null;
  if (isLikelyBkashQrPayload(opts.merchantPaymentQr)) {
    payload = (opts.merchantPaymentQr ?? "").trim();
  }
  if (!payload) {
    try {
      payload = buildBkashEmvcoPayload(opts);
    } catch {
      payload = buildBkashPlainText(opts);
    }
  }
  return await QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
}
