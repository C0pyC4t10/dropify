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

const FINANCE_REDIRECTS = [
  // Expenses → /finance. Old /expenses moved under Finance (Expenses tab).
  { source: "/expenses", destination: "/finance", permanent: true },
];

const INVENTORY_REDIRECTS = [
  // Stock, Purchase Orders, Suppliers → /inventory. The three pages share
  // one tabbed shell, default = Stock.
  { source: "/stock", destination: "/inventory", permanent: true },
  { source: "/stock/new", destination: "/inventory/stock-new", permanent: true },
  {
    source: "/purchase-orders",
    destination: "/inventory?tab=purchase-orders",
    permanent: true,
  },
  {
    source: "/purchase-orders/:id",
    destination: "/inventory/purchase-orders/:id",
    permanent: true,
  },
  {
    source: "/suppliers",
    destination: "/inventory?tab=suppliers",
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
  allowedDevOrigins: [
    "192.168.68.58",
    "192.168.68.60",
    "localhost",
    "127.0.0.1",
  ],
  redirects: () => [
    ...LOGISTICS_REDIRECTS,
    ...INVENTORY_REDIRECTS,
    ...FINANCE_REDIRECTS,
  ],
};

export default nextConfig;
