/** Cookie name used to track the active tenant. Lives for the browser
 *  session so the dispatcher keeps their last-selected company across
 *  page loads. Read by `src/lib/tenant.ts` (server) and
 *  `src/lib/active-company.tsx` (client). Keep this file dependency-free
 *  so it can be imported from both runtimes.
 */
export const ACTIVE_COMPANY_COOKIE = "active_company_id";
