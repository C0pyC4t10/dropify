import { cookies } from "next/headers";
import { DEFAULT_COMPANY_ID } from "./db";
import { ACTIVE_COMPANY_COOKIE } from "./tenant-constants";

// Re-export so callers can keep importing the constant from "@/lib/tenant".
export { ACTIVE_COMPANY_COOKIE };

/**
 * Resolve the active company from the incoming request.
 *
 * Order of precedence:
 *   1. The `x-company-id` request header (explicit override).
 *   2. The `active_company_id` cookie (set by the switcher).
 *   3. `DEFAULT_COMPANY_ID` (1, the meat company).
 *
 * Validation: the resolved id must be a positive integer. If the cookie or
 * header carries garbage, we fall back to the default. We don't 400 here
 * because we want to be lenient on legacy/unknown clients.
 *
 * NOTE: This module uses `next/headers` and is therefore server-only. The
 * cookie constant itself lives in `./tenant-constants` so client code can
 * read/write the cookie without dragging in `next/headers`.
 */
export async function getCompanyIdFromRequest(req: Request): Promise<number> {
  const headerVal = req.headers.get("x-company-id");
  if (headerVal && /^\d+$/.test(headerVal)) {
    const n = parseInt(headerVal, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }

  try {
    // Next.js 15+: cookies() returns a Promise; await it.
    const store = await cookies();
    const cookieVal = store.get(ACTIVE_COMPANY_COOKIE)?.value;
    if (cookieVal && /^\d+$/.test(cookieVal)) {
      const n = parseInt(cookieVal, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    /* `cookies()` is only available in route handlers / server components.
     * In client contexts callers should pass req explicitly. */
  }

  return DEFAULT_COMPANY_ID;
}
