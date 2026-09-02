"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

// Leaflet touches `window` on import, so we wrap with next/dynamic + ssr:false.
const ClientDhakaClusterMap = dynamic(() => import("./dhaka-cluster-map"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 460,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-elevated, #1a1a1a)",
        color: "var(--text-muted)",
        borderRadius: 10,
        fontSize: 13,
        border: "1px solid var(--border)",
      }}
    >
      Loading map…
    </div>
  ),
});

export type ClientDhakaClusterMapProps = ComponentProps<typeof ClientDhakaClusterMap>;
export default ClientDhakaClusterMap;