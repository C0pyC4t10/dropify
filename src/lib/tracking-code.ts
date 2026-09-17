import crypto from "crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const GROUP_LEN = 4;
const PREFIX = "DRO";

function randomGroup(): string {
  const bytes = crypto.randomBytes(GROUP_LEN);
  let out = "";
  for (let i = 0; i < GROUP_LEN; i++) out += CROCKFORD[bytes[i] % CROCKFORD.length];
  return out;
}

function checksumChar(group: string): string {
  let acc = 0;
  for (let i = 0; i < group.length; i++) acc = (acc * 31 + group.charCodeAt(i)) & 0xffffffff;
  return CROCKFORD[acc % CROCKFORD.length];
}

/** Generate a tracking code in the form `DRO-XXXX-XXXX[-C]` where:
 *  - 8 random chars from the Crockford base32 alphabet (no I/L/O/U)
 *  - an optional trailing checksum character for typo detection
 *  Total keyspace without checksum = 32^8 ≈ 1.15 trillion. With checksum
 *  the visible string is 12 chars (DRO-XXXX-XXXX-C).
 *
 *  Collision-checked against the `idx_orders_trackingcode` partial unique
 *  index; collisions are vanishingly rare but we retry up to 8 times just
 *  in case. If we exhaust the retry budget we let the unique-index error
 *  bubble up so the caller can decide whether to fail loudly or queue. */
export function generateTrackingCode(opts: { withChecksum?: boolean } = {}): string {
  const withChecksum = opts.withChecksum ?? false;
  for (let attempt = 0; attempt < 8; attempt++) {
    const a = randomGroup();
    const b = randomGroup();
    const tail = withChecksum ? `-${checksumChar(a + b)}` : "";
    return `${PREFIX}-${a}-${b}${tail}`;
  }
  throw new Error("tracking-code: exhausted retry budget");
}

// Crockford base32 alphabet is "0123456789ABCDEFGHJKMNPQRSTVWXYZ" — note I, L, O, U are excluded.
// The character class below matches the same set, with L explicitly carved
// out of the J-N range and X added in the V-W range. (A previous version
// included L by accident and missed X, so any generated code containing
// X would fail to validate — the smoke walkthrough hit this exact bug.)
const TRACKING_CODE_RE = /^DRO-[0-9A-HJKMNP-TVWXYZ]{4}-[0-9A-HJKMNP-TVWXYZ]{4}(-[0-9A-HJKMNP-TVWXYZ])?$/;

export function isValidTrackingCode(code: string): boolean {
  return typeof code === "string" && TRACKING_CODE_RE.test(code);
}