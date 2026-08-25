/**
 * Geo utilities for the route planner.
 *
 * Distances: prefer OSRM road-network distance when available (realistic
 * for Dhaka's one-way streets and rivers), fall back to Haversine.
 * Durations: OSRM is the only source (no flat 30 km/h assumption).
 */

const EARTH_RADIUS_METERS = 6371000;

const toRad = (d: number): number => (d * Math.PI) / 180;

/** Dhaka average speed assumption (used only as a last-resort fallback). */
export const DHAKA_AVG_SPEED_MPS = 30_000 / 3600;

/** OSRM demo server — free, no API key. Rate-limited to ~1 req/sec fair use. */
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

/** Haversine great-circle distance between two coordinates, in meters. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/** Convenience: estimated duration in minutes for a given distance at DHAKA_AVG_SPEED_MPS. */
export function estimateMinutes(distanceMeters: number): number {
  if (distanceMeters <= 0) return 0;
  return Math.round((distanceMeters / DHAKA_AVG_SPEED_MPS) / 60);
}

export interface Coord {
  lat: number;
  lng: number;
}

/**
 * A stop is what the optimizer orders: an order with a known coordinate.
 * (Order IDs are preserved so the caller can persist the resulting sequence.)
 */
export interface Stop {
  orderId: number;
  coord: Coord;
}

/**
 * Result of a route optimization: stops in the order they should be visited,
 * with per-leg distance and duration. The first leg is from the origin to
 * the first stop; subsequent legs go stop → stop.
 */
export interface OptimizedRoute {
  sequence: number[]; // order IDs in visit order
  legs: Array<{
    fromOrderId: number | null; // null means "from shop"
    toOrderId: number;
    distanceMeters: number;
    estSeconds: number;
  }>;
  totalDistanceMeters: number;
  totalEstSeconds: number;
}

/**
 * Nearest-Neighbor TSP seed: starting from `origin`, walk to the nearest
 * unvisited stop until all stops are visited. O(n²). Returns the sequence
 * of order IDs. Does NOT mutate the input.
 */
export function nearestNeighborSequence(origin: Coord, stops: Stop[]): number[] {
  if (stops.length === 0) return [];
  const remaining = stops.slice();
  const order: number[] = [];
  let current: Coord = origin;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(current.lat, current.lng, remaining[i].coord.lat, remaining[i].coord.lng);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    order.push(next.orderId);
    current = next.coord;
  }
  return order;
}

/**
 * 2-opt improvement pass: reverse a sub-tour if it shortens the total
 * distance. Repeats until no improvement is found. O(n²) per pass, usually
 * converges in 2-4 passes for n ≤ 30.
 */
export function twoOptImprove(order: number[], stopsByOrderId: Map<number, Stop>, origin: Coord): number[] {
  if (order.length < 4) return order;
  const n = order.length;
  const dist = (a: Coord, b: Coord): number => haversineMeters(a.lat, a.lng, b.lat, b.lng);
  const coordOf = (id: number): Coord => stopsByOrderId.get(id)?.coord ?? origin;
  const totalDist = (seq: number[]): number => {
    let d = 0;
    let prev: Coord = origin;
    for (const id of seq) {
      const next = coordOf(id);
      d += dist(prev, next);
      prev = next;
    }
    return d;
  };
  let improved = true;
  let best = order.slice();
  let bestDist = totalDist(best);
  for (let pass = 0; pass < 20 && improved; pass++) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const candidate = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const candidateDist = totalDist(candidate);
        if (candidateDist + 1e-6 < bestDist) {
          best = candidate;
          bestDist = candidateDist;
          improved = true;
        }
      }
    }
  }
  return best;
}

/**
 * End-to-end optimizer: nearest-neighbor seed + 2-opt improvement. Returns
 * the ordered sequence plus per-leg distance and ETA.
 */
export function optimizeRoute(origin: Coord, stops: Stop[]): OptimizedRoute {
  if (stops.length === 0) {
    return { sequence: [], legs: [], totalDistanceMeters: 0, totalEstSeconds: 0 };
  }
  const stopsByOrderId = new Map<number, Stop>();
  for (const s of stops) stopsByOrderId.set(s.orderId, s);

  const seed = nearestNeighborSequence(origin, stops);
  const improved = twoOptImprove(seed, stopsByOrderId, origin);

  const legs: OptimizedRoute["legs"] = [];
  let total = 0;
  let prev: Coord = origin;
  let prevId: number | null = null;
  for (const id of improved) {
    const stop = stopsByOrderId.get(id);
    if (!stop) continue;
    const d = haversineMeters(prev.lat, prev.lng, stop.coord.lat, stop.coord.lng);
    const seconds = Math.round(d / DHAKA_AVG_SPEED_MPS);
    legs.push({ fromOrderId: prevId, toOrderId: id, distanceMeters: Math.round(d), estSeconds: seconds });
    total += d;
    prev = stop.coord;
    prevId = id;
  }
  return {
    sequence: improved,
    legs,
    totalDistanceMeters: Math.round(total),
    totalEstSeconds: Math.round(total / DHAKA_AVG_SPEED_MPS),
  };
}

/**
 * Re-sequence an existing order (e.g., after a dispatcher drags a stop
 * to a new position). Recomputes the per-leg distances for the new
 * sequence using the same legs-of-distance math. Returns the new legs.
 */
export function recomputeLegs(origin: Coord, sequence: number[], stopsByOrderId: Map<number, Stop>): OptimizedRoute {
  const legs: OptimizedRoute["legs"] = [];
  let total = 0;
  let prev: Coord = origin;
  let prevId: number | null = null;
  for (const id of sequence) {
    const stop = stopsByOrderId.get(id);
    if (!stop) continue;
    const d = haversineMeters(prev.lat, prev.lng, stop.coord.lat, stop.coord.lng);
    const seconds = Math.round(d / DHAKA_AVG_SPEED_MPS);
    legs.push({ fromOrderId: prevId, toOrderId: id, distanceMeters: Math.round(d), estSeconds: seconds });
    total += d;
    prev = stop.coord;
    prevId = id;
  }
  return {
    sequence: sequence.slice(),
    legs,
    totalDistanceMeters: Math.round(total),
    totalEstSeconds: Math.round(total / DHAKA_AVG_SPEED_MPS),
  };
}

// ===========================================================================
// OSRM road-network routing
// ===========================================================================

export interface RoadLeg {
  distanceMeters: number;
  durationSeconds: number;
}

export interface RoadRoute {
  legs: RoadLeg[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  /** "osrm" when the network result is fresh, "haversine" as a fallback. */
  source: "osrm" | "haversine";
  /** When the network result was not available, the failure reason. */
  fallbackReason?: string;
}

/** In-memory cache: "lng,lat;lng,lat;..." → RoadRoute. Bound to 1000 entries. */
const osrmCache = new Map<string, RoadRoute>();
const MAX_OSRM_CACHE = 1000;

/** Configurable timeout per OSRM HTTP call. */
const OSRM_TIMEOUT_MS = 6000;

function osrmCacheKey(coords: Coord[]): string {
  return coords.map((c) => `${c.lng.toFixed(5)},${c.lat.toFixed(5)}`).join(";");
}

function pushOsrmCache(key: string, value: RoadRoute): void {
  if (osrmCache.size >= MAX_OSRM_CACHE) {
    const first = osrmCache.keys().next().value;
    if (first !== undefined) osrmCache.delete(first);
  }
  osrmCache.set(key, value);
}

/** Haversine fallback (same shape as RoadRoute). Used when OSRM fails. */
function haversineRoute(coords: Coord[]): RoadRoute {
  const legs: RoadLeg[] = [];
  let totalDistance = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = haversineMeters(
      coords[i - 1].lat,
      coords[i - 1].lng,
      coords[i].lat,
      coords[i].lng,
    );
    const dur = Math.round(d / DHAKA_AVG_SPEED_MPS);
    legs.push({ distanceMeters: Math.round(d), durationSeconds: dur });
    totalDistance += d;
  }
  return {
    legs,
    totalDistanceMeters: Math.round(totalDistance),
    totalDurationSeconds: Math.round(totalDistance / DHAKA_AVG_SPEED_MPS),
    source: "haversine",
    fallbackReason: "OSRM unavailable or returned no route",
  };
}

/**
 * Compute a road-network route through a sequence of points (origin → stops).
 * Uses OSRM's public demo; falls back to Haversine if OSRM fails.
 *
 * The returned legs[] length is always coords.length - 1.
 */
export async function roadRoute(coords: Coord[]): Promise<RoadRoute> {
  if (coords.length < 2) {
    return { legs: [], totalDistanceMeters: 0, totalDurationSeconds: 0, source: "haversine" };
  }

  const key = osrmCacheKey(coords);
  const cached = osrmCache.get(key);
  if (cached) return cached;

  const coordStr = coords.map((c) => `${c.lng},${c.lat}`).join(";");
  const url = `${OSRM_BASE}/${coordStr}?overview=false&alternatives=false&steps=false`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "BazareyOps/1.0" },
    });
    if (!res.ok) {
      const fb = haversineRoute(coords);
      fb.fallbackReason = `OSRM HTTP ${res.status}`;
      pushOsrmCache(key, fb);
      return fb;
    }
    const body = (await res.json()) as {
      code?: string;
      routes?: Array<{
        legs?: Array<{ distance: number; duration: number }>;
      }>;
    };
    if (body.code !== "Ok" || !body.routes?.[0]?.legs) {
      const fb = haversineRoute(coords);
      fb.fallbackReason = `OSRM code=${body.code ?? "no-routes"}`;
      pushOsrmCache(key, fb);
      return fb;
    }
    const r = body.routes[0];
    const legs: RoadLeg[] = r.legs!.map((l) => ({
      distanceMeters: Math.round(l.distance),
      durationSeconds: Math.round(l.duration),
    }));
    const totalDistanceMeters = legs.reduce((s, l) => s + l.distanceMeters, 0);
    const totalDurationSeconds = legs.reduce((s, l) => s + l.durationSeconds, 0);
    const result: RoadRoute = {
      legs,
      totalDistanceMeters,
      totalDurationSeconds,
      source: "osrm",
    };
    pushOsrmCache(key, result);
    return result;
  } catch (e) {
    const fb = haversineRoute(coords);
    fb.fallbackReason = `OSRM ${(e as Error)?.name ?? "error"}`;
    pushOsrmCache(key, fb);
    return fb;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Synchronous haversine-only route (no OSRM call). Useful in client-side
 * code paths that need an instant answer without a network round-trip.
 */
export function haversineRouteSync(coords: Coord[]): RoadRoute {
  return haversineRoute(coords);
}

/** Clear the OSRM cache (useful for tests). */
export function clearOsrmCache(): void {
  osrmCache.clear();
}
