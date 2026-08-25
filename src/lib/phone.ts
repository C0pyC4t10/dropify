// Phone number normalization for customer matching.
// All stored phone numbers are converted to canonical BD mobile format
// (e.g. "01711234567") so any visual variant of the same number collides
// at lookup time:
//   "01711234567"        → "01711234567"
//   "+880 1711-234567"   → "01711234567"
//   "880 171 123 4567"   → "01711234567"
//   " +88-01711-234567"  → "01711234567"
//   ""                   → ""
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input).trim();
  // Strip +, spaces, dashes, parentheses — anything visually noisy.
  s = s.replace(/[\s+\-()]/g, "");
  // Strip leading international prefix: 0088, 880, 88, plus already removed.
  if (s.startsWith("0088")) s = s.slice(4);
  if (s.startsWith("880")) s = s.slice(3);
  if (s.startsWith("88")) s = s.slice(2);
  // After stripping country code, BD mobiles drop the leading "0". Re-prepend.
  if (s.startsWith("1")) s = "0" + s;
  return s;
}

// Returns true if the candidate phone is the same person as the stored one.
export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  return na === nb;
}

// Heuristic: does this look like a valid BD mobile number?
// 11 digits, starts with "01".
export function isLikelyBdMobile(phone: string): boolean {
  const n = normalizePhone(phone);
  return /^01[3-9]\d{8}$/.test(n);
}
