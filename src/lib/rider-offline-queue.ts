"use client";

/**
 * Offline queue for rider deliveries. Persists pending actions (status
 * changes + photo blobs + COD amounts + reason codes) in IndexedDB so a
 * rider can complete a delivery end-to-end while offline — lift, basement,
 * dead spot between buildings — and have the whole thing sync when
 * connectivity returns.
 *
 * Each queued item can carry an optional photo Blob. Photos are
 * client-downscaled (canvas → JPEG, max 1280 px, q=0.7) BEFORE being
 * stored so the queue stays well under IndexedDB quota. A single downscaled
 * JPEG is ~200–500 KB; the default cap (10 items × ~500 KB + a few KB of
 * metadata) fits comfortably in the typical browser's several-hundred-MB
 * IndexedDB quota.
 *
 * The queue never silently drops items on flush failure. Items that can't
 * be uploaded remain queued until either the next successful flush or an
 * operator manually clears them via the admin console (Phase 6).
 *
 * Server is the source of truth: every replayed item still goes through
 * the same POD gate (photo + OTP verified + COD captured for delivered).
 * A photo upload that succeeds but a transition that 423s (e.g. the OTP
 * gate blocks because the rider skipped OTP verification offline) keeps
 * the item queued so the admin can resolve via admin_override_pod_bypass.
 */

import type { OrderStatus } from "./types";

const DB_NAME = "dropify-rider-queue";
const STORE = "pending-actions";
const META_STORE = "queue-meta";
const VERSION = 2;

/** Max items in the queue. Beyond this, enqueue() returns false and the UI
 *  shows a "queue full — find signal first" prompt. 10 items × ~500 KB
 *  fits comfortably in any browser's IndexedDB quota. */
export const QUEUE_MAX_ITEMS = 10;

/** Per-item soft cap on photo bytes. Anything bigger gets downscaled again
 *  client-side before being accepted. */
export const QUEUE_MAX_PHOTO_BYTES = 1_500_000;

export interface QueuedAction {
  id: string;
  orderId: number;
  toStatus: OrderStatus;
  reason: string;
  lat: number | null;
  lng: number | null;
  enqueuedAt: number;
  /** Optional photo to upload first, before the transition. */
  photoBlob?: Blob;
  photoMime?: string;
  /** Optional COD amount captured at the same time as the photo. */
  amountCollected?: number | null;
  /** True when the rider skipped OTP entry because they were offline. The
   *  server's POD gate will block delivered; admin resolves via override. */
  otpSkippedOffline?: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode: IDBTransactionMode, stores: string[]): Promise<unknown> {
  const db = await openDb();
  return db.transaction(stores, mode);
}

export async function enqueueAction(
  item: Omit<QueuedAction, "enqueuedAt">
): Promise<{ ok: boolean; reason?: string; replaced?: boolean }> {
  if (item.photoBlob && item.photoBlob.size > QUEUE_MAX_PHOTO_BYTES) {
    return { ok: false, reason: `photo exceeds ${QUEUE_MAX_PHOTO_BYTES} bytes` };
  }
  const db = await openDb();
  const store = db.transaction(STORE, "readwrite").objectStore(STORE);
  return new Promise((resolve, reject) => {
    const allReq = store.getAll();
    allReq.onerror = () => reject(allReq.error);
    allReq.onsuccess = () => {
      const existing = (allReq.result as QueuedAction[]).find(
        (i) => i.orderId === item.orderId
      );
      if (!existing && allReq.result.length >= QUEUE_MAX_ITEMS) {
        resolve({ ok: false, reason: `queue full (${QUEUE_MAX_ITEMS} items)` });
        return;
      }
      // Reuse the existing item's id so audit/debug traces stay stable.
      const id = existing?.id ?? item.id;
      const putReq = store.put({ ...item, id, enqueuedAt: Date.now() });
      putReq.onerror = () => reject(putReq.error);
      putReq.onsuccess = () =>
        resolve({ ok: true, replaced: !!existing });
    };
  });
}

export async function listPending(): Promise<QueuedAction[]> {
  const store = await tx("readonly", [STORE]);
  const storeHandle = (store as IDBTransaction).objectStore(STORE);
  return new Promise((resolve, reject) => {
    const req = storeHandle.getAll();
    req.onsuccess = () => {
      const list = (req.result as QueuedAction[]).sort((a, b) => a.enqueuedAt - b.enqueuedAt);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removePending(id: string): Promise<void> {
  const store = await tx("readwrite", [STORE]);
  const storeHandle = (store as IDBTransaction).objectStore(STORE);
  return new Promise((resolve, reject) => {
    const req = storeHandle.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function pendingCount(): Promise<number> {
  const items = await listPending();
  return items.length;
}

export async function pendingBytes(): Promise<number> {
  const items = await listPending();
  let bytes = 0;
  for (const item of items) {
    if (item.photoBlob) bytes += item.photoBlob.size;
    bytes += 256;
  }
  return bytes;
}

export async function pendingPhotoCount(): Promise<number> {
  const items = await listPending();
  return items.filter((i) => !!i.photoBlob).length;
}

/**
 * Replay queued actions against the server in enqueue order. For each item:
 *   1. Upload the photo (multipart) if present
 *   2. POST COD amount if captured
 *   3. POST the transition
 *   4. Only remove the item from the queue after ALL three succeed
 *
 * Any failure leaves the item queued and records an error. Caller surfaces
 * the error count so the rider knows their work isn't lost.
 */
export async function flushQueue(accessToken: string): Promise<{
  flushed: number;
  errors: Array<{ id: string; message: string }>;
}> {
  const items = await listPending();
  if (items.length === 0) return { flushed: 0, errors: [] };

  const errors: Array<{ id: string; message: string }> = [];
  let flushed = 0;

  for (const item of items) {
    try {
      if (item.photoBlob) {
        const form = new FormData();
        const ext = item.photoMime === "image/png" ? "png" : "jpg";
        form.append("photo", new File([item.photoBlob], `delivery.${ext}`, { type: item.photoMime ?? "image/jpeg" }));
        const photoRes = await fetch(`/api/rider/orders/${item.orderId}/pod/photo`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        });
        if (!photoRes.ok) {
          const j = await photoRes.json().catch(() => ({}));
          errors.push({ id: item.id, message: `photo: ${j.error || photoRes.status}` });
          continue;
        }
      }

      if (item.amountCollected !== undefined && item.amountCollected !== null) {
        const codRes = await fetch(`/api/rider/orders/${item.orderId}/pod/cod`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ amount: item.amountCollected }),
        });
        if (!codRes.ok && codRes.status !== 400) {
          const j = await codRes.json().catch(() => ({}));
          errors.push({ id: item.id, message: `cod: ${j.error || codRes.status}` });
          continue;
        }
      }

      const transRes = await fetch(`/api/rider/orders/${item.orderId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          toStatus: item.toStatus,
          reason: item.reason || undefined,
          lat: item.lat ?? undefined,
          lng: item.lng ?? undefined,
        }),
      });
      if (!transRes.ok) {
        const j = await transRes.json().catch(() => ({}));
        // OTP gate is server-side truth. If the gate blocks (because no OTP
        // was captured offline), leave the item queued — admin can resolve
        // via admin_override_pod_bypass. The photo + COD are already on the
        // server so the admin has full context.
        errors.push({ id: item.id, message: `transition: ${j.error || transRes.status}` });
        continue;
      }

      await removePending(item.id);
      flushed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ id: item.id, message });
    }
  }

  return { flushed, errors };
}