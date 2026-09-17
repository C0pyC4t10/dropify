"use client";

/**
 * Client-side image downscaling for the offline photo queue. We don't want
 * to ship multi-MB phone-camera JPEGs into IndexedDB — quota matters,
 * especially on Android Chrome where the per-origin quota is shared with
 * localStorage and the rest of IndexedDB. A 1280 px max-dimension JPEG at
 * quality 0.7 typically lands at 200–500 KB while staying readable enough
 * for proof-of-delivery.
 *
 * Falls back gracefully: if the browser can't decode the image (corrupt
 * file, weird codec) or the canvas is unavailable, the original File
 * passes through unchanged and the queue cap catches oversized items.
 */

export interface DownscaleResult {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  bytes: number;
}

export const DOWNSCEALED_MAX_DIMENSION = 1280;
export const DOWNSCEALED_QUALITY = 0.7;

export async function downscaleImage(file: File): Promise<DownscaleResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Not an image file");
  }
  if (typeof document === "undefined") {
    return { blob: file, mime: file.type, width: 0, height: 0, bytes: file.size };
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return { blob: file, mime: file.type, width: 0, height: 0, bytes: file.size };
  }

  const ratio = Math.min(1, DOWNSCEALED_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * ratio));
  const h = Math.max(1, Math.round(img.naturalHeight * ratio));

  if (ratio === 1 && file.type === "image/jpeg") {
    URL.revokeObjectURL(img.src);
    return { blob: file, mime: file.type, width: w, height: h, bytes: file.size };
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(img.src);
    return { blob: file, mime: file.type, width: img.naturalWidth, height: img.naturalHeight, bytes: file.size };
  }
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);

  const blob = await canvasToBlob(canvas, "image/jpeg", DOWNSCEALED_QUALITY);
  if (!blob) {
    return { blob: file, mime: file.type, width: img.naturalWidth, height: img.naturalHeight, bytes: file.size };
  }
  return { blob, mime: "image/jpeg", width: w, height: h, bytes: blob.size };
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}