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

/** Public URL a rider's avatar can be fetched at. Returns null if no avatar. */
export function riderAvatarUrl(riderId: number, avatarPath: string): string | null {
  if (!resolveRiderAvatarPath(riderId, avatarPath)) return null;
  return `/api/rider/avatar/${riderId}`;
}