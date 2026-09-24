import { spawn } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

function getLanIp() {
  const interfaces = os.networkInterfaces();
  const fallback = [];
  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name] || []) {
      if (info.family !== "IPv4" || info.internal) continue;
      const lower = name.toLowerCase();
      if (
        lower.includes("vmware") ||
        lower.includes("virtualbox") ||
        lower.includes("hyper-v") ||
        lower.includes("wsl") ||
        lower.includes("docker") ||
        lower.includes("veth") ||
        lower.includes("tailscale")
      ) {
        continue;
      }
      return { ip: info.address, name };
    }
  }
  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name] || []) {
      if (info.family === "IPv4" && !info.internal) {
        fallback.push({ ip: info.address, name });
      }
    }
  }
  return fallback[0] || { ip: "127.0.0.1", name: "localhost" };
}

/** Make sure the current LAN IP is in next.config.ts → allowedDevOrigins.
 *  Next.js 16 blocks every dev chunk + HMR socket from origins that
 *  aren't whitelisted there — which is why phones silently get stuck
 *  on "Loading…" after the laptop's DHCP lease changes. Patching the
 *  config before start means the dev server picks up the right value
 *  on its first read, no manual edit needed. */
function syncAllowedDevOrigins(currentIp) {
  const cfgPath = path.resolve(process.cwd(), "next.config.ts");
  if (!fs.existsSync(cfgPath)) return;
  const src = fs.readFileSync(cfgPath, "utf8");
  const match = src.match(/allowedDevOrigins:\s*\[([^\]]*)\]/);
  if (!match) return;
  const body = match[1];
  if (new RegExp(`["']${currentIp.replace(/\./g, "\\.")}["']`).test(body)) return;
  const patched = src.replace(
    /allowedDevOrigins:\s*\[[^\]]*\]/,
    (m) => m.replace(/\[/, `[ "${currentIp}",`)
  );
  fs.writeFileSync(cfgPath, patched);
  console.log(`\x1b[33m[dev-lan]\x1b[0m added ${currentIp} to allowedDevOrigins in next.config.ts`);
}

const port = process.env.PORT || "3000";
const { ip, name } = getLanIp();
syncAllowedDevOrigins(ip);

console.log("\n\x1b[36m=== Meat Delivery — LAN Dev Server ===\x1b[0m");
console.log(`\x1b[32mLocal:\x1b[0m   http://localhost:${port}`);
console.log(`\x1b[32mLAN:\x1b[0m     http://${ip}:${port}   (${name})`);
console.log("\x1b[33mMake sure your phone is on the same Wi-Fi network.\x1b[0m\n");

const child = spawn(
  "node",
  ["./node_modules/next/dist/bin/next", "dev", "-H", "0.0.0.0", "-p", port],
  { stdio: "inherit", shell: false }
);

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));