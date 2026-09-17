import fs from "fs";
import path from "path";
import crypto from "crypto";

const SECRET_FILE = path.join(process.cwd(), "data", "rider-jwt-secret");
const SECRET_BYTES = 32;

let cachedSecret: Buffer | null = null;

function loadOrCreateSecret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const dir = path.dirname(SECRET_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(SECRET_FILE)) {
    const raw = fs.readFileSync(SECRET_FILE, "utf8").trim();
    const buf = Buffer.from(raw, "base64");
    if (buf.length === SECRET_BYTES) {
      cachedSecret = buf;
      return buf;
    }
  }
  const fresh = crypto.randomBytes(SECRET_BYTES);
  fs.writeFileSync(SECRET_FILE, fresh.toString("base64"), { mode: 0o600 });
  cachedSecret = fresh;
  return fresh;
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

function hmacSha256(secret: Buffer, payload: string): Buffer {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export type RiderTokenType = "access" | "refresh";

export interface RiderTokenPayload {
  sub: number;
  type: RiderTokenType;
  sid: number;
  iat: number;
  exp: number;
}

export interface SignTokenInput {
  riderId: number;
  sessionId: number;
  type: RiderTokenType;
  ttlSeconds: number;
}

export function signRiderToken(input: SignTokenInput): string {
  const secret = loadOrCreateSecret();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "RIDER" };
  const payload: RiderTokenPayload = {
    sub: input.riderId,
    sid: input.sessionId,
    type: input.type,
    iat: now,
    exp: now + input.ttlSeconds,
  };
  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(payload));
  const signingInput = `${head}.${body}`;
  const sig = b64url(hmacSha256(secret, signingInput));
  return `${signingInput}.${sig}`;
}

export type VerifyResult =
  | { ok: true; payload: RiderTokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_type" };

export function verifyRiderToken(
  token: string,
  expectedType: RiderTokenType
): VerifyResult {
  if (typeof token !== "string") return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [head, body, sig] = parts;
  const secret = loadOrCreateSecret();
  const expected = b64url(hmacSha256(secret, `${head}.${body}`));
  if (!timingSafeEqual(sig, expected)) return { ok: false, reason: "bad_signature" };
  let parsed: RiderTokenPayload;
  try {
    parsed = JSON.parse(b64urlDecode(body).toString("utf8")) as RiderTokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (parsed.type !== expectedType) return { ok: false, reason: "wrong_type" };
  if (typeof parsed.exp !== "number" || parsed.exp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  if (typeof parsed.sub !== "number" || typeof parsed.sid !== "number") {
    return { ok: false, reason: "malformed" };
  }
  return { ok: true, payload: parsed };
}

export const RIDER_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const RIDER_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export function accessTokenTtlSeconds(): number {
  return RIDER_ACCESS_TOKEN_TTL_SECONDS;
}

export function refreshTokenTtlSeconds(): number {
  return RIDER_REFRESH_TOKEN_TTL_SECONDS;
}