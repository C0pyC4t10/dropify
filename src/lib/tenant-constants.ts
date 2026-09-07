/** Cookie name used to track the active tenant. Lives for the browser
 *  session so the dispatcher keeps their last-selected company across
 *  page loads. Read by `src/lib/tenant.ts` (server) and
 *  `src/lib/active-company.tsx` (client). Keep this file dependency-free
 *  so it can be imported from both runtimes.
 */
export const ACTIVE_COMPANY_COOKIE = "active_company_id";

/** Cookie set when the operator explicitly unlocks the Dropify admin console.
 *  When this cookie is absent, every /admin/** route renders a "locked"
 *  gate. Setting the cookie (via the form on /admin) toggles admin mode
 *  for the current browser session — no real auth, but enough to keep
 *  the console out of reach from an unattended dispatcher terminal. */
export const ADMIN_MODE_COOKIE = "dropify_admin_mode";
