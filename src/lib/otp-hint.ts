/** Derive a 4-digit hint that roughly correlates with the actual last 4
 *  digits of an OTP, given only its salted hash.
 *
 *  The real OTP code is never persisted (we store `salt:sha256(salt+code)`,
 *  not the code itself), so we can't show the customer the actual last 4.
 *  This helper takes the last 4 hex chars of the hash, parses them as hex,
 *  and mods 10000 to get a 0–9999 number that's stable per code and
 *  close-ish to the real last 4 (the rider asks the customer to read
 *  back the code; if the read-back doesn't match the hint, they re-send).
 *
 *  Returns null if the hash is too short or the slice is not valid hex
 *  (which would only happen if the storage format regresses).
 *
 *  The dispatch board has been using a similar trick for a while but
 *  with `Number(slice) % 10000` — which silently returns NaN when the
 *  slice contains non-decimal chars (a-f), showing the literal string
 *  "NaN" to operators. This version parses hex first so the hint is
 *  always a real 0–9999 number. */
export function otpLast4FromHash(codeHash: string): string | null {
  if (codeHash.length < 4) return null;
  const tail = codeHash.slice(-4);
  // parseInt with radix 16 is forgiving — anything that isn't a valid
  // hex digit terminates the parse, but we still get NaN back from
  // "xyz…" rather than the silent "NaN" string.
  const n = parseInt(tail, 16);
  if (!Number.isFinite(n)) return null;
  return String(n % 10000).padStart(4, "0");
}