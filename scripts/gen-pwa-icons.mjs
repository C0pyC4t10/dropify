// One-shot generator for PWA icons. Run with: node scripts/gen-pwa-icons.mjs
import sharp from "sharp";
import path from "path";
import { promises as fs } from "fs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public");
const COLORS = {
  bg: "#1a7a3a",
  fg: "#ffffff",
};

async function makeIcon(size, filename) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
  <rect width="64" height="64" rx="14" fill="${COLORS.bg}"/>
  <path d="M32 12 C24 12 19 18 19 26 V38 C19 46 24 52 32 52 C40 52 45 46 45 38 V26 C45 18 40 12 32 12 Z M32 19 C35.5 19 38 22 38 26 V38 C38 42 35.5 45 32 45 C28.5 45 26 42 26 38 V26 C26 22 28.5 19 32 19 Z" fill="${COLORS.fg}"/>
  <circle cx="32" cy="32" r="3.5" fill="${COLORS.fg}"/>
</svg>`;
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join(OUT, filename));
  console.log(`wrote ${filename} (${size}x${size})`);
}

await makeIcon(192, "icon-192.png");
await makeIcon(512, "icon-512.png");
await makeIcon(180, "apple-touch-icon.png");

await fs.writeFile(
  path.join(OUT, "manifest.webmanifest"),
  JSON.stringify(
    {
      name: "Dropify Rider",
      short_name: "Dropify",
      description: "Rider delivery tracking app for Dropify",
      start_url: "/rider/orders",
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: "#1a7a3a",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    null,
    2
  )
);
console.log("wrote manifest.webmanifest");