interface Bucket {
  tokens: number;
  lastRefill: number;
}

interface LimitConfig {
  capacity: number;
  refillPerMinute: number;
}

const buckets = new Map<string, Bucket>();

const DEFAULTS: Record<string, LimitConfig> = {
  login: { capacity: 10, refillPerMinute: 5 },
  "login-ip": { capacity: 30, refillPerMinute: 10 },
  refresh: { capacity: 60, refillPerMinute: 30 },
};

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function consumeRateLimit(
  bucketName: keyof typeof DEFAULTS,
  key: string,
  config?: Partial<LimitConfig>
): RateLimitResult {
  const cfg: LimitConfig = {
    capacity: config?.capacity ?? DEFAULTS[bucketName].capacity,
    refillPerMinute: config?.refillPerMinute ?? DEFAULTS[bucketName].refillPerMinute,
  };
  const fullKey = `${bucketName}:${key}`;
  const now = Date.now();
  const refillPerMs = cfg.refillPerMinute / 60_000;
  const existing = buckets.get(fullKey);
  let bucket: Bucket;
  if (!existing) {
    bucket = { tokens: cfg.capacity, lastRefill: now };
    buckets.set(fullKey, bucket);
  } else {
    const elapsed = now - existing.lastRefill;
    const refilled = Math.min(cfg.capacity, existing.tokens + elapsed * refillPerMs);
    bucket = { tokens: refilled, lastRefill: now };
    buckets.set(fullKey, bucket);
  }
  if (bucket.tokens < 1) {
    const deficit = 1 - bucket.tokens;
    const retryAfterSeconds = Math.ceil(deficit / refillPerMs / 1000);
    return { ok: false, remaining: 0, retryAfterSeconds };
  }
  bucket.tokens -= 1;
  return { ok: true, remaining: Math.floor(bucket.tokens), retryAfterSeconds: 0 };
}

export function resetRateLimit(bucketName: keyof typeof DEFAULTS, key: string): void {
  buckets.delete(`${bucketName}:${key}`);
}

export function resetAllRateLimits(): void {
  buckets.clear();
}