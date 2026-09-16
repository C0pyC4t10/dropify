"use client";

/**
 * Thin wrapper around fetch that attaches the rider's bearer token and
 * handles 401 by clearing local auth + redirecting to login. Used by every
 * rider page that calls /api/rider/*.
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

export async function riderFetch(url: string, opts: RiderFetchOptions): Promise<Response> {
  const headers = new Headers(opts.headers);
  if (!headers.has("Content-Type") && opts.body && typeof opts.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", `Bearer ${opts.accessToken}`);
  return fetch(url, { ...opts, headers });
}

export async function riderGetJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await riderFetch(url, { method: "GET", accessToken });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      notifyAuthLost();
    }
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
    if (res.status === 401 || res.status === 403) {
      notifyAuthLost();
    }
    throw new RiderApiError(res.status, json.reason || "request_failed", json.error || `status ${res.status}`);
  }
  return json as T;
}

/** Dispatch a window event the AuthProvider listens for. We don't hard-reload
 *  here so an in-flight delivery doesn't lose its scroll position or photo
 *  capture mid-flow. */
function notifyAuthLost() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem("dropify-rider-auth"); } catch {}
  window.dispatchEvent(new CustomEvent("rider:auth-lost"));
}