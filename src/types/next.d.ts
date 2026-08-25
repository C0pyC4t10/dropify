declare module "next" {
  export type NextConfig = {
    reactStrictMode?: boolean;
    serverExternalPackages?: string[];
    images?: {
      remotePatterns?: Array<{
        protocol?: string;
        hostname: string;
        port?: string;
        pathname?: string;
      }>;
      domains?: string[];
    };
    experimental?: {
      serverActions?: {
        bodySizeLimit?: string;
      };
    };
    [key: string]: unknown;
  };

  export type Metadata = {
    title?: string;
    description?: string;
    [key: string]: unknown;
  };

  export type Viewport = {
    width?: string;
    initialScale?: number;
    [key: string]: unknown;
  };
}

declare module "next/types.js" {
  import type { Metadata, Viewport } from "next";
  export type ResolvingMetadata = (parent?: Metadata) => Promise<Metadata>;
  export type ResolvingViewport = (parent?: Viewport) => Promise<Viewport>;
}

declare module "next/server" {
  export type NextRequest = Request & {
    nextUrl: URL & {
      searchParams: URLSearchParams;
    };
    cookies: {
      get(name: string): { value: string } | undefined;
      set(name: string, value: string): void;
      delete(name: string): void;
    };
    ip?: string;
    geo?: { country?: string; city?: string; region?: string };
  };
  export const NextResponse: {
    json<T>(body: T, init?: ResponseInit): Response;
    redirect(url: string, init?: ResponseInit): Response;
  };
}

declare module "next/headers" {
  export function cookies(): {
    get(name: string): { value: string } | undefined;
    set(name: string, value: string): void;
    delete(name: string): void;
  };
  export function headers(): Headers;
}

declare module "next/navigation" {
  export function useRouter(): {
    push(href: string): void;
    replace(href: string): void;
    refresh(): void;
    back(): void;
    forward(): void;
  };
  export function usePathname(): string;
  export function useSearchParams(): URLSearchParams;
  export function useParams<T = Record<string, string>>(): T;
  export function redirect(url: string): never;
  export function notFound(): never;
}

declare module "next/link" {
  import type { ComponentType, AnchorHTMLAttributes, ReactNode } from "react";
  const Link: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children?: ReactNode;
    prefetch?: boolean;
    replace?: boolean;
  }>;
  export default Link;
}