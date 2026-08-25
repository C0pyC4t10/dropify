/**
 * Geocoding service for Dhaka metro addresses.
 *
 * Uses Photon (Komoot) as the primary provider — free, no rate limits (fair
 * use), and has good Bangladesh coverage (better than Nominatim for Dhaka).
 * Falls back to our curated area-centroids table when Photon returns nothing.
 *
 * Results are cached in-memory so we don't hit Photon twice for the same
 * query within a process.
 *
 * Photon endpoint:
 *   https://photon.komoot.io/api/?q=<query>&lat=23.77&lon=90.40&zoom=12&limit=1
 */

import { getAreaCentroid, type AreaCentroid } from "./area-centroids";

// Dhaka center used to bias the search toward Dhaka rather than other
// places with the same name (e.g. "Dhanmondi" elsewhere in Bangladesh).
const DHAKA_BIAS = { lat: 23.77, lng: 90.4 };

// In-memory cache: query → result. Bound to 500 entries.
const cache = new Map<string, GeocodeResult | null>();
const MAX_CACHE = 500;

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** How confident we are (0 = fallback centroid, 1 = exact match). */
  confidence: number;
  /** Source of the result. */
  source: "photon" | "centroid";
  /** Display name returned by Photon, if any. */
  displayName?: string;
}

/** Bangladesh country code so Photon doesn't match other countries. */
const BD_LOCALE = "en";

/** Default fetch timeout so a stuck Photon doesn't block order creation. */
const FETCH_TIMEOUT_MS = 4000;

/**
 * Geocode a free-text address biased to Dhaka. Returns the best lat/lng we
 * can find, or null if the query is empty / no result.
 *
 * Strategy:
 *   1. In-memory cache hit (instant)
 *   2. Photon query (network, with timeout)
 *   3. Fall back to curated area-centroid lookup
 */
export async function geocodeAddress(input: {
  area?: string | null;
  address?: string | null;
  customerName?: string | null;
  /** If a customer has been geocoded before, pass the customer's coords to bias. */
  hint?: { lat: number; lng: number } | null;
}): Promise<GeocodeResult | null> {
  // Build the search query. Order: explicit address → area → area + "Dhaka"
  const area = (input.area || "").trim();
  const address = (input.address || "").trim();
  const cacheKey = `${address}|${area}|${BD_LOCALE}`;

  if (cacheKey === "|en" || (!address && !area)) {
    // No usable query — fall through to centroid by area, if any
    if (!area) return null;
    const c = getAreaCentroid(area);
    return { lat: c.lat, lng: c.lng, confidence: 0.3, source: "centroid" };
  }

  // Cache hit (including negative results)
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }

  // Build the query string. Photon accepts Bengali Unicode natively, so
  // we pass the raw address through without sanitizing diacritics or
  // transliterating to Latin. Appending ", Dhaka, Bangladesh" biases the
  // result away from other places with the same name.
  const queryParts = [address, area, "Dhaka", "Bangladesh"].filter(Boolean);
  const query = queryParts.join(", ");

  // Try Photon first
  let result = await tryPhoton(query, input.hint);

  // Photon came back empty — fall back to our area centroid (better than nothing)
  if (!result && area) {
    const c = getAreaCentroid(area);
    result = { lat: c.lat, lng: c.lng, confidence: 0.3, source: "centroid" };
  }

  // Cap cache size (drop oldest by re-inserting)
  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(cacheKey, result);

  return result;
}

/** Geocode with NO cache — used by the manual /api/orders/[id]/geocode route. */
export async function geocodeAddressFresh(input: {
  area?: string | null;
  address?: string | null;
  customerName?: string | null;
  hint?: { lat: number; lng: number } | null;
}): Promise<GeocodeResult | null> {
  // Bust the cache for this exact key
  const area = (input.area || "").trim();
  const address = (input.address || "").trim();
  const cacheKey = `${address}|${area}|${BD_LOCALE}`;
  cache.delete(cacheKey);
  return geocodeAddress(input);
}

async function tryPhoton(
  query: string,
  hint: { lat: number; lng: number } | null | undefined,
): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    q: query,
    lat: String(hint?.lat ?? DHAKA_BIAS.lat),
    lon: String(hint?.lng ?? DHAKA_BIAS.lng),
    // zoom 12 = city-level; bigger = smaller area
    zoom: "12",
    // limit to a single best result
    limit: "1",
    lang: BD_LOCALE,
  });
  const url = `https://photon.komoot.io/api/?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "BazareyOps/1.0" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: { name?: string; city?: string; country?: string };
      }>;
    };
    const feat = body.features?.[0];
    const coords = feat?.geometry?.coordinates;
    if (!coords || coords.length !== 2) return null;
    const [lng, lat] = coords;
    if (typeof lat !== "number" || typeof lng !== "number") return null;

    // Confidence: Photon match in Dhaka is usually pretty good. We could
    // grade by feature "type" (street vs suburb) but for MVP this is fine.
    const confidence = 0.85;
    return {
      lat,
      lng,
      confidence,
      source: "photon",
      displayName: feat.properties?.name,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Clear the in-memory cache (useful for tests / forced re-geocode). */
export function clearGeocodeCache(): void {
  cache.clear();
}

/**
 * Backwards-compat helper that returns a centroid synchronously (no Photon
 * call). Used by code paths that can't be async (e.g. order form preview).
 * Returns null if there's no signal at all.
 */
export function quickCentroid(
  area: string | null | undefined,
  _address?: string | null,
): AreaCentroid {
  return getAreaCentroid(area);
}