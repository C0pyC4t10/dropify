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
  const [state, setState] = useState<AuthState>(() => {
    const stored = readStored();
    if (stored) {
      return { status: "authed", accessToken: stored.accessToken, session: stored.session };
    }
    return { status: "guest", accessToken: null, session: null };
  });

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

  // Listen for the rider:auth-lost event from rider-api (401/403 responses).
  // Soft-redirect to login instead of full reload so in-flight flows keep state.
  useEffect(() => {
    function onAuthLost() {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      setState({ status: "guest", accessToken: null, session: null });
      router.replace("/rider/login");
    }
    window.addEventListener("rider:auth-lost", onAuthLost);
    return () => window.removeEventListener("rider:auth-lost", onAuthLost);
  }, [router]);

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