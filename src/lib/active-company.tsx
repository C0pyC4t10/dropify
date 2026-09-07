"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Company } from "@/lib/types";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/tenant-constants";

interface ActiveCompanyContextValue {
  companies: Company[];
  activeCompany: Company | null;
  activeCompanyId: number | null;
  setActiveCompanyId: (id: number) => void;
  /** True until the initial /api/companies fetch resolves. */
  loading: boolean;
  /** Reload the company list — call after creating a new company. */
  refresh: () => Promise<void>;
}

const ActiveCompanyContext = createContext<ActiveCompanyContextValue | null>(null);

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="));
  return match ? match.split("=")[1] : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  // Session cookie — cleared when the browser closes. The dev server picks
  // up the change on the next request.
  document.cookie = `${name}=${value}; path=/; SameSite=Lax`;
}

export function ActiveCompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/companies");
      const list = (await res.json()) as Company[];
      setCompanies(list);
      // If no cookie yet, or cookie points to a no-longer-active company,
      // fall back to the first company.
      const cookieVal = readCookie(ACTIVE_COMPANY_COOKIE);
      const cookieNum = cookieVal && /^\d+$/.test(cookieVal) ? parseInt(cookieVal, 10) : null;
      const stillActive = cookieNum != null && list.some((c) => c.id === cookieNum);
      const resolved = stillActive ? cookieNum : list[0]?.id ?? null;
      if (resolved != null && resolved !== activeCompanyId) {
        setActiveCompanyIdState(resolved);
        writeCookie(ACTIVE_COMPANY_COOKIE, String(resolved));
      }
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveCompanyId = useCallback((id: number) => {
    setActiveCompanyIdState(id);
    writeCookie(ACTIVE_COMPANY_COOKIE, String(id));
    // Reload to pick up new server-side data on next render.
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) ?? null,
    [companies, activeCompanyId]
  );

  // Per-tenant accent color: when the active company has one configured,
  // override the platform's CSS variables so buttons / highlights / the
  // header wordmark accent all pick up the tenant's brand. Lives in a
  // <style> tag scoped to <html data-company="..."> so theme toggles can
  // still win via the [data-theme="light"] / [data-theme="dark"] selectors.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (!activeCompany) {
      root.removeAttribute("data-company");
      root.style.removeProperty("--accent-green-override");
      root.style.removeProperty("--accent-amber-override");
      return;
    }
    root.setAttribute("data-company", activeCompany.slug);
    const accent = activeCompany.accentColor?.trim();
    if (accent && /^#?[0-9a-fA-F]{3,8}$/.test(accent)) {
      const hex = accent.startsWith("#") ? accent : `#${accent}`;
      root.style.setProperty("--accent-green-override", hex);
    } else {
      root.style.removeProperty("--accent-green-override");
    }
  }, [activeCompany]);

  const value = useMemo<ActiveCompanyContextValue>(
    () => ({
      companies,
      activeCompany,
      activeCompanyId,
      setActiveCompanyId,
      loading,
      refresh,
    }),
    [companies, activeCompany, activeCompanyId, setActiveCompanyId, loading, refresh]
  );

  return (
    <ActiveCompanyContext.Provider value={value}>
      {children}
    </ActiveCompanyContext.Provider>
  );
}

export function useActiveCompany(): ActiveCompanyContextValue {
  const ctx = useContext(ActiveCompanyContext);
  if (!ctx) {
    throw new Error("useActiveCompany must be used within <ActiveCompanyProvider>");
  }
  return ctx;
}
