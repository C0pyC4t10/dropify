"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import RouteMap from "./route-map";

/**
 * SSR-safe wrapper for the Leaflet map. Leaflet touches `window` at import
 * time, so we dynamic-import the inner component with `ssr: false`. The
 * outer loader renders a placeholder of the same height so the layout
 * doesn't jump after hydration.
 */
const RouteMapDynamic = dynamic(() => import("./route-map"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 480,
        width: "100%",
        borderRadius: 8,
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-elevated, #1a1a1a)",
        color: "var(--text-muted)",
        fontSize: 13,
      }}
    >
      Loading map…
    </div>
  ),
});

export type ClientRouteMapProps = ComponentProps<typeof RouteMap>;

export default function ClientRouteMap(props: ClientRouteMapProps) {
  return <RouteMapDynamic {...props} />;
}
