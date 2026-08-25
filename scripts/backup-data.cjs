#!/usr/bin/env node
/**
 * Create a clean, portable snapshot of the meat-delivery data.
 *
 * - Uses SQLite VACUUM INTO so the snapshot is consistent (no WAL/shm cruft)
 *   even if the dev server is running.
 * - Copies legacy data/db.json if present.
 * - Copies .env if present (secrets) so Ubuntu can be configured identically.
 * - Output goes to ./backups/<timestamp>/
 *
 * After running, copy that folder to Ubuntu (USB / cloud / scp) and run
 *   node scripts/restore-data.cjs backups/<timestamp>
 */
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const ROOT = process.cwd();
const SRC_DATA = path.join(ROOT, "data");
const SRC_DB = path.join(SRC_DATA, "meat_delivery.db");
const SRC_JSON = path.join(SRC_DATA, "db.json");
const SRC_ENV = path.join(ROOT, ".env");

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .replace("T", "_")
  .slice(0, 19);
const OUT_DIR = path.join(ROOT, "backups", `data-${stamp}`);

function fail(msg) {
  console.error(`\n[backup-data] ERROR: ${msg}\n`);
  process.exit(1);
}

if (!fs.existsSync(SRC_DB)) fail(`SQLite DB not found at ${SRC_DB}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log(`[backup-data] Output: ${OUT_DIR}`);

// 1. Clean SQLite snapshot via VACUUM INTO
console.log("[backup-data] Creating SQLite snapshot via VACUUM INTO ...");
const destDb = path.join(OUT_DIR, "meat_delivery.db");
const db = new Database(SRC_DB, { readonly: true });
try {
  db.exec(`VACUUM INTO '${destDb.replace(/'/g, "''")}'`);
} catch (e) {
  fail(`VACUUM INTO failed: ${e.message}`);
} finally {
  db.close();
}
const dbSize = fs.statSync(destDb).size;
console.log(`[backup-data]   wrote meat_delivery.db (${(dbSize / 1024).toFixed(1)} KB)`);

// 2. Legacy JSON (optional)
if (fs.existsSync(SRC_JSON)) {
  fs.copyFileSync(SRC_JSON, path.join(OUT_DIR, "db.json"));
  console.log(`[backup-data]   copied db.json`);
} else {
  console.log(`[backup-data]   (no data/db.json found, skipping)`);
}

// 3. .env (optional, with a heads-up)
if (fs.existsSync(SRC_ENV)) {
  fs.copyFileSync(SRC_ENV, path.join(OUT_DIR, ".env"));
  console.log(`[backup-data]   copied .env  (contains secrets — handle carefully)`);
} else {
  console.log(`[backup-data]   (no .env in project root, skipping)`);
}

// 4. Manifest
const manifest = {
  createdAt: new Date().toISOString(),
  sqliteDbBytes: dbSize,
  contents: fs.readdirSync(OUT_DIR).sort(),
  restoreCommand: `node scripts/restore-data.cjs backups/data-${stamp}`,
};
fs.writeFileSync(
  path.join(OUT_DIR, "MANIFEST.json"),
  JSON.stringify(manifest, null, 2),
);

console.log(`\n[backup-data] DONE.\n`);
console.log(`Next steps:`);
console.log(`  1. Make sure the Ubuntu dev server is STOPPED before restoring.`);
console.log(`  2. Copy this folder to Ubuntu:`);
console.log(`       ${OUT_DIR}`);
console.log(`  3. On Ubuntu, run:`);
console.log(`       node scripts/restore-data.cjs backups/data-${stamp}`);
