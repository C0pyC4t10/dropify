"use client";

/**
 * Thin wrapper around fetch that attaches the rider's bearer token and
 * handles 401 transparently by:
 *   1. Calling /api/rider/refresh (the httpOnly refresh cookie rides
 *      along automatically — no client-side token juggling needed).
 *   2. If the refresh returns a new accessToken, retrying the original
 *      request with it.
 *   3. Only dispatching `rider:auth-lost` (which kicks the rider out to
 *      /rider/login) when BOTH the refresh and the retry fail.
 *
 * Concurrent 401s are deduped via a single in-flight refresh promise so
 * the rider doesn't fire off five refreshes when the orders page hits
 * multiple endpoints at once.
 */

export class RiderApiError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string, message: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

export interface RiderFetchOptions extends RequestInit {
  accessToken: string;
}

interface RefreshOk {
  ok: true;
  accessToken: string;
}
interface RefreshFail {
  ok: false;
}
type RefreshResult = RefreshOk | RefreshFail;

let refreshInFlight: Promise<RefreshResult> | null = null;

async function tryRefreshToken(): Promise<RefreshResult> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch("/api/rider/refresh", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) return { ok: false };
      const json = await res.json().catch(() => ({}));
      if (!json || typeof json.accessToken !== "string" || !json.accessToken) {
        return { ok: false };
      }
      // Notify AuthProvider so it can swap the new accessToken into state
      // and localStorage. The server also rotates the refresh cookie.
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("rider:token-refreshed", { detail: { accessToken: json.accessToken } }),
        );
      }
      return { ok: true, accessToken: json.accessToken };
    } catch {
      return { ok: false };
    } finally {
      // Release the slot after a microtask so any concurrent caller that
      // was queued on this same in-flight promise doesn't immediately
      // re-trigger a second refresh on the next 401.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

function notifyAuthLost() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem("dropify-rider-auth"); } catch {}
  window.dispatchEvent(new CustomEvent("rider:auth-lost"));
}

async function fetchWithAutoRefresh(
  url: string,
  opts: RequestInit,
  accessToken: string,
): Promise<Response> {
  const headers = new Headers(opts.headers);
  if (!headers.has("Content-Type") && opts.body && typeof opts.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", `Bearer ${accessToken}`);

  let res = await fetch(url, { ...opts, headers });
  if (res.status !== 401) return res;

  // Token is bad. Try to swap a fresh one in via the refresh cookie.
  const refresh = await tryRefreshToken();
  if (!refresh.ok) {
    notifyAuthLost();
    return res;
  }

  // Retry with the new token. If THIS also 401s, the account is genuinely
  // gone (suspended / deleted) and we should kick the rider out.
  headers.set("Authorization", `Bearer ${refresh.accessToken}`);
  res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    notifyAuthLost();
  }
  return res;
}

export async function riderFetch(url: string, opts: RiderFetchOptions): Promise<Response> {
  return fetchWithAutoRefresh(url, opts, opts.accessToken);
}

export async function riderGetJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await riderFetch(url, { method: "GET", accessToken });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new RiderApiError(res.status, json.reason || "request_failed", json.error || `status ${res.status}`);
  }
  return json as T;
}

export async function riderPostJson<T>(
  url: string,
  body: unknown,
  accessToken: string
): Promise<T> {
  const res = await riderFetch(url, {
    method: "POST",
    body: JSON.stringify(body),
    accessToken,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new RiderApiError(res.status, json.reason || "request_failed", json.error || `status ${res.status}`);
  }
  return json as T;
}