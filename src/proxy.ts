import { NextResponse, type NextRequest } from "next/server";

/**
 * Rider session scope guard.
 *
 * The rider PWA (Phase 5) issues an httpOnly `rider_refresh_token` cookie
 * on login. Middleware can read it; a logged-in rider's browser sends it
 * on every navigation. Before this middleware existed, a rider who logged
 * into /rider and then typed /orders/[id] or /logistics/riders/[id] or
 * /admin/dispatch into the address bar would see the unrestricted
 * operator/admin pages — a real customer-data leak.
 *
 * This middleware detects a rider session and:
 *   - For HTML pages under /admin, /orders, /logistics, /customers, /expenses,
 *     /suppliers, /purchase-orders, /stock, /settings → redirects
 *     to /rider (the rider PWA's own order list).
 *   - For /api/admin/* and /api/orders/*, /api/riders/*, /api/customers,
 *     etc. → returns 403 (server is the source of truth).
 *   - Allows /rider/*, /api/rider/*, /track/*, /api/track/*, and everything
 *     else (the operator/admin flow does NOT set rider_refresh_token).
 *
 * Legacy /riders + /routes URLs also get blocked here because the prefix
 * check catches them and bounces them to /rider, which is reasonable on a
 * rider phone (the operator never navigates to those paths). The redirect
 * target /logistics is what blocks the rider explicitly.
 *
 * Cookies used:
 *   - rider_refresh_token — httpOnly cookie set by /api/rider/login + refresh.
 *     Its presence is the marker for "this browser is logged in as a rider".
 *
 * Note: this does NOT change the existing admin cookie gate. Admin pages
 * still require `dropify_admin_mode=1` separately — this only ensures a
 * rider session can never reach admin pages.
 */

const RIDER_REFRESH_COOKIE = "rider_refresh_token";

const RIDER_ALLOWED_PAGE_PREFIXES = [
  "/rider",
  "/track",                // public customer tracking page
  "/api/rider",
  "/api/track",
];

// Operators live here. We do NOT allow a rider to land on any of these.
// (Riders reach their own orders via /rider/orders/[id] instead of /orders/[id].)
const RIDER_BLOCKED_PAGE_PREFIXES = [
  "/admin",
  "/orders",
  "/riders",          // legacy /riders + /riders/[id]/... URLs
  "/logistics",       // new unified Logistics shell (Riders tab + Routes tab)
  "/customers",
  "/expenses",
  "/routes",          // legacy /routes + /routes/[riderId]/... URLs
  "/suppliers",
  "/purchase-orders",
  "/stock",
  "/settings",
  "/design-system",
  "/api/admin",
  "/api/orders",
  "/api/riders",
  "/api/customers",
  "/api/expenses",
  "/api/routes",
  "/api/suppliers",
  "/api/purchase-orders",
  "/api/stock",
  "/api/settings",
];

function isRiderRequest(req: NextRequest): boolean {
  return req.cookies.get(RIDER_REFRESH_COOKIE)?.value
    ? true
    : false;
}

function isRiderAllowed(pathname: string): boolean {
  return RIDER_ALLOWED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

function isRiderBlocked(pathname: string): boolean {
  return RIDER_BLOCKED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!isRiderRequest(req)) {
    return NextResponse.next();
  }

  if (isRiderAllowed(pathname)) {
    return NextResponse.next();
  }

  if (isRiderBlocked(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: "Rider session cannot access operator APIs." },
        { status: 403 },
      );
    }
    // Page navigation — redirect to the rider's own home.
    const url = req.nextUrl.clone();
    url.pathname = "/rider";
    url.search = "";
    return NextResponse.redirect(url, 302);
  }

  // Unknown path under a rider session — be lenient and let it through.
  // The middleware's job is to prevent SEEN leaks (admin/operator pages),
  // not to lock down every URL the rider might hit.
  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets and _next internals — keeping
  // this broad means future pages inherit the guard by default.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest\\.webmanifest|sw\\.js|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)",
  ],
};