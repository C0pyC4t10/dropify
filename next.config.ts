import type { NextConfig } from "next";

const LOGISTICS_REDIRECTS = [
  // Riders → /logistics. The roster moved under Logistics (Riders tab).
  { source: "/riders", destination: "/logistics?tab=riders", permanent: true },
  { source: "/riders/:id", destination: "/logistics/riders/:id", permanent: true },
  {
    source: "/riders/:id/manifest",
    destination: "/logistics/riders/:id/manifest",
    permanent: true,
  },
  // Routes → /logistics. The map + plan-route page moved under Logistics
  // (Routes tab, default).
  { source: "/routes", destination: "/logistics", permanent: true },
  { source: "/routes/preview", destination: "/logistics/preview", permanent: true },
  {
    source: "/routes/:riderId",
    destination: "/logistics/:riderId",
    permanent: true,
  },
  {
    source: "/routes/:riderId/print",
    destination: "/logistics/:riderId/print",
    permanent: true,
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@tailwindcss/oxide",
    "@tailwindcss/oxide-linux-x64-gnu",
    "lightningcss",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  allowedDevOrigins: ["192.168.68.58", "localhost", "127.0.0.1"],
  redirects: () => LOGISTICS_REDIRECTS,
};

export default nextConfig;
