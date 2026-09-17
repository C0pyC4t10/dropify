import type { NextConfig } from "next";

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
};

export default nextConfig;