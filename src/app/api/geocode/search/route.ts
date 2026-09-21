import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Nominatim (OpenStreetMap) address-search proxy.
 *
 * Why a server proxy and not a direct client call:
 *  - Nominatim's usage policy requires a real User-Agent identifying the
 *    application (they block the default browser UA). Server-side we
 *    always send a stable identifier, the client can't be tampered with.
 *  - One server-side rate limit keeps us under the public endpoint's
 *    1 req/sec ceiling even if the rider searches fast.
 *  - The server can swap providers later (Mapbox, Google, etc.) without
 *    shipping a new client build.
 *
 * GET /api/geocode/search?q=<query>&limit=<n>
 *   q:     required, ≥ 3 chars
 *   limit: optional, 1..10, default 5
 *   near:  optional, "lat,lng" to bias results around a point (the
 *          rider's current GPS so results are "near me")
 *
 * Response: [{ displayName, lat, lng, type, importance }, ...]
 *   type is Nominatim's class (e.g. "house", "road", "suburb")
 *   importance is Nominatim's 0..1 confidence score
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

interface NominatimHit {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  importance?: number;
}

const recentCalls: number[] = [];
const MIN_INTERVAL_MS = 1100; // slightly above Nominatim's 1 req/sec ceiling

async function takeSlot(): Promise<boolean> {
  const now = Date.now();
  // Drop entries older than 5s.
  while (recentCalls.length && recentCalls[0] < now - 5000) recentCalls.shift();
  if (recentCalls.length >= 1 && now - recentCalls[recentCalls.length - 1] < MIN_INTERVAL_MS) {
    return false;
  }
  recentCalls.push(now);
  return true;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  if (q.length < 3) {
    return NextResponse.json(
      { ok: false, error: "Query must be at least 3 characters." },
      { status: 400 },
    );
  }
  const limit = Math.max(1, Math.min(10, Number(params.get("limit") ?? 5) || 5));
  const near = params.get("near");

  // Token-bucket rate limit — Nominatim rejects bursts.
  if (!(await takeSlot())) {
    return NextResponse.json(
      { ok: false, error: "Search rate limit — slow down a second." },
      { status: 429 },
    );
  }

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));
  // Bias results to Bangladesh (Nominatim defaults to global ranking which
  // can surface far-away same-name places).
  url.searchParams.set("viewbox", "90.20,23.55,90.55,23.95");
  url.searchParams.set("bounded", "1");
  if (near) {
    const [lat, lng] = near.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lng));
    }
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        // Nominatim's usage policy: must include a real User-Agent
        // identifying the application, not a generic browser UA.
        "User-Agent": "BazareyLtdMeat-DeliveryOps/1.0 (ops@bazarey.example)",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Nominatim returned ${res.status}` },
        { status: 502 },
      );
    }
    const hits = (await res.json()) as NominatimHit[];
    const results = hits.map((h) => ({
      displayName: h.display_name,
      lat: Number(h.lat),
      lng: Number(h.lon),
      type: h.type ?? null,
      klass: h.class ?? null,
      importance: h.importance ?? 0,
    }));
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "network error" },
      { status: 502 },
    );
  }
}