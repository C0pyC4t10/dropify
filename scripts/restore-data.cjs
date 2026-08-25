#!/usr/bin/env node
/**
 * Restore a backup created by scripts/backup-data.cjs into ./data/.
 *
 * Usage:
 *   node scripts/restore-data.cjs <backup-folder>
 *
 * Example:
 *   node scripts/restore-data.cjs backups/data-2026-08-25_12-30-00
 *
 * IMPORTANT: Stop the dev server (npm run dev) before running this,
 * otherwise SQLite WAL files may overwrite the restored DB.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");
const arg = process.argv[2];

function fail(msg) {
  console.error(`\n[restore-data] ERROR: ${msg}\n`);
  process.exit(1);
}

if (!arg) fail("Usage: node scripts/restore-data.cjs <backup-folder>");
const BACKUP = path.resolve(ROOT, arg);
if (!fs.existsSync(BACKUP) || !fs.statSync(BACKUP).isDirectory()) {
  fail(`Backup folder not found: ${BACKUP}`);
}

const srcDb = path.join(BACKUP, "meat_delivery.db");
const srcJson = path.join(BACKUP, "db.json");
const srcEnv = path.join(BACKUP, ".env");

if (!fs.existsSync(srcDb)) fail(`Backup is missing meat_delivery.db: ${srcDb}`);

fs.mkdirSync(DATA, { recursive: true });

const destDb = path.join(DATA, "meat_delivery.db");
const destShm = path.join(DATA, "meat_delivery.db-shm");
const destWal = path.join(DATA, "meat_delivery.db-wal");

// 1. Remove any existing DB + WAL files so SQLite doesn't pick up stale state
for (const f of [destDb, destShm, destWal]) {
  if (fs.existsSync(f)) {
    fs.unlinkSync(f);
    console.log(`[restore-data] removed existing ${path.basename(f)}`);
  }
}

// 2. Copy clean SQLite snapshot
fs.copyFileSync(srcDb, destDb);
console.log(`[restore-data] restored meat_delivery.db (${(fs.statSync(destDb).size / 1024).toFixed(1)} KB)`);

// 3. Legacy JSON (optional)
if (fs.existsSync(srcJson)) {
  fs.copyFileSync(srcJson, path.join(DATA, "db.json"));
  console.log(`[restore-data] restored data/db.json`);
} else {
  console.log(`[restore-data]   (no db.json in backup, skipping)`);
}

// 4. .env (optional, only if user confirms overwrite)
if (fs.existsSync(srcEnv)) {
  const destEnv = path.join(ROOT, ".env");
  if (fs.existsSync(destEnv)) {
    console.log(`[restore-data]   .env already exists at ${destEnv} — leaving it alone.`);
    console.log(`                  Backup .env is at: ${srcEnv}`);
    console.log(`                  Manually diff/merge if you want to overwrite.`);
  } else {
    fs.copyFileSync(srcEnv, destEnv);
    console.log(`[restore-data] restored .env to project root`);
  }
}

console.log(`\n[restore-data] DONE. You can now run:  npm run dev\n`);
