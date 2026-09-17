import fs from "fs";
import path from "path";

export const AVATAR_ROOT = path.join(process.cwd(), "data", "rider-avatars");

/** Resolve on-disk avatar path for a rider, or null if none set or unsafe. */
export function resolveRiderAvatarPath(riderId: number, avatarPath: string): string | null {
  if (!avatarPath) return null;
  const abs = path.isAbsolute(avatarPath) ? avatarPath : path.join(process.cwd(), avatarPath);
  const resolved = path.resolve(abs);
  const root = path.resolve(AVATAR_ROOT);
  if (!resolved.startsWith(root + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

/** Public URL a rider's avatar can be fetched at, with a cache-busting
 *  query string derived from the file's mtime so the URL changes whenever
 *  the rider replaces their photo. Returns null if no avatar is set. */
export function riderAvatarUrl(riderId: number, avatarPath: string): string | null {
  const abs = resolveRiderAvatarPath(riderId, avatarPath);
  if (!abs) return null;
  let v = "0";
  try {
    v = Math.floor(fs.statSync(abs).mtimeMs).toString(36);
  } catch {
    /* ignore — fall back to "0" which is harmless */
  }
  return `/api/rider/avatar/${riderId}?v=${v}`;
}