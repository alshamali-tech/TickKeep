/* Client-side receipt compression (ADR-013).
 * Photos straight from a phone are 3–8 MB; stored as base64 that's +33% more.
 * We resize to ≤900×700 and re-encode as JPEG q0.72 — receipts stay legible
 * and each one lands well under ~200 KB, protecting the storage quota. */

export interface CompressResult {
  dataUrl: string;
  bytes: number;
  originalBytes: number;
  width: number;
  height: number;
}

const MAX_W = 900;
const MAX_H = 700;
const QUALITY = 0.72;
const TARGET_BYTES = 200 * 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("unreadable image"));
    img.src = src;
  });
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL("image/jpeg", quality);
}

/** Compress an image File. Falls back to the raw data URL when canvas fails. */
export async function compressReceipt(file: File): Promise<CompressResult> {
  const original = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });

  try {
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#ffffff"; // JPEG has no alpha — flatten receipts onto white
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    /* Step quality down until we're under target (or quality floor). */
    let q = QUALITY;
    let dataUrl = toJpeg(canvas, q);
    while (dataUrl.length > TARGET_BYTES * 1.37 && q > 0.4) {
      q -= 0.12;
      dataUrl = toJpeg(canvas, q);
    }
    // base64 ≈ bytes × 1.37
    return { dataUrl, bytes: Math.round(dataUrl.length / 1.37), originalBytes: file.size, width: w, height: h };
  } catch {
    return { dataUrl: original, bytes: file.size, originalBytes: file.size, width: 0, height: 0 };
  }
}

export const kb = (bytes: number): string => `${Math.max(1, Math.round(bytes / 1024))} KB`;
