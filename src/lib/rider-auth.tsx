"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

interface RiderSession {
  riderId: number;
  riderName: string;
  phone: string;
  vehicle: string;
  mustChangePin: boolean;
}

type AuthStatus = "loading" | "authed" | "guest";

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  session: RiderSession | null;
}

interface AuthContextValue extends AuthState {
  login: (phone: string, pin: string) => Promise<{ mustChangePin: boolean }>;
  logout: () => Promise<void>;
  setAccessToken: (token: string, session: RiderSession) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "dropify-rider-auth";

function readStored(): { accessToken: string; session: RiderSession } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Start as "loading" on both server and first client render so hydration
  // matches. The localStorage read happens in an effect below — the UI shows
  // a brief "Loading…" state, then transitions to authed/guest.
  const [state, setState] = useState<AuthState>({
    status: "loading",
    accessToken: null,
    session: null,
  });

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "authed", accessToken: stored.accessToken, session: stored.session });
    } else {
      setState({ status: "guest", accessToken: null, session: null });
    }
  }, []);

  const persist = useCallback((accessToken: string, session: RiderSession) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, session })); } catch {}
  }, []);

  const login = useCallback(async (phone: string, pin: string) => {
    const res = await fetch("/api/rider/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, pin }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error(err.error || `status ${res.status}`);
    }
    const json = await res.json();
    const session: RiderSession = {
      riderId: json.rider.id,
      riderName: json.rider.name,
      phone: json.rider.phone,
      vehicle: json.rider.vehicle,
      mustChangePin: !!json.mustChangePin,
    };
    persist(json.accessToken, session);
    setState({ status: "authed", accessToken: json.accessToken, session });
    return { mustChangePin: session.mustChangePin };
  }, [persist]);

  const logout = useCallback(async () => {
    const token = state.accessToken;
    if (token) {
      try {
        await fetch("/api/rider/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setState({ status: "guest", accessToken: null, session: null });
  }, [state.accessToken]);

  const setAccessToken = useCallback((token: string, session: RiderSession) => {
    persist(token, session);
    setState({ status: "authed", accessToken: token, session });
  }, [persist]);

  // Listen for the rider:auth-lost event from rider-api. This now fires
  // only when both the silent refresh AND the retry-with-new-token fail
  // — see rider-api.ts. Soft-redirect to login instead of full reload so
  // an in-flight flow doesn't lose its scroll position or photo capture.
  useEffect(() => {
    function onAuthLost() {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      setState({ status: "guest", accessToken: null, session: null });
      router.replace("/rider/login");
    }
    window.addEventListener("rider:auth-lost", onAuthLost);
    return () => window.removeEventListener("rider:auth-lost", onAuthLost);
  }, [router]);

  // Pick up silently-refreshed access tokens dispatched by rider-api. The
  // refresh rotates the httpOnly cookie server-side, so we only need to
  // swap the accessToken into React state + localStorage.
  useEffect(() => {
    function onTokenRefreshed(e: Event) {
      const detail = (e as CustomEvent<{ accessToken: string }>).detail;
      if (!detail?.accessToken) return;
      setState((prev) => {
        if (!prev.session) return prev;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: detail.accessToken, session: prev.session })); } catch {}
        return { ...prev, accessToken: detail.accessToken };
      });
    }
    window.addEventListener("rider:token-refreshed", onTokenRefreshed);
    return () => window.removeEventListener("rider:token-refreshed", onTokenRefreshed);
  }, []);

  // Proactive background refresh: fire /api/rider/refresh every 10 min
  // while the rider is signed in. The access token TTL is 15 min, so
  // 10 min gives us a comfortable buffer before the token would expire
  // mid-request. The rider never sees this happen.
  useEffect(() => {
    if (state.status !== "authed") return;
    const REFRESH_MS = 10 * 60 * 1000;
    const tick = () => {
      fetch("/api/rider/refresh", { method: "POST", credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.accessToken && typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("rider:token-refreshed", { detail: { accessToken: json.accessToken } }),
            );
          }
        })
        .catch(() => {
          /* network blip — next 401 will retry via the auto-refresh path */
        });
    };
    const handle = setInterval(tick, REFRESH_MS);
    return () => clearInterval(handle);
  }, [state.status]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, setAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Hook that calls `cb` whenever the SW posts `dropify:online` or the
 *  browser's online state flips back to true. Used to flush the offline
 *  queue. */
export function useOnlineFlush(cb: () => void) {
  useEffect(() => {
    function trigger() {
      if (typeof navigator !== "undefined" && navigator.onLine) cb();
    }
    window.addEventListener("online", trigger);
    function onMsg(event: MessageEvent) {
      if (event.data?.type === "dropify:online") cb();
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMsg);
    }
    return () => {
      window.removeEventListener("online", trigger);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMsg);
      }
    };
  }, [cb]);
}