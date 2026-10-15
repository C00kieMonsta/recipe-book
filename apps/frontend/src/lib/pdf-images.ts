import type { BrandKind } from "@packages/types";
import { ApiError, api, getToken } from "@/lib/api";

export interface PdfImage {
  dataUrl: string;
  format: "PNG" | "JPEG";
  width: number;
  height: number;
}

export interface LoadImageOptions {
  // Cover-crop the centre to this width / height ratio (4 for the banner); the result is a JPEG.
  cropRatio?: number;
  // Pixel width cap of the returned image, default 1600.
  maxWidth?: number;
}

const DEFAULT_MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.85;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Lecture de l'image impossible"));
    reader.readAsDataURL(blob);
  });
}

function decode(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = dataUrl;
  });
}

function formatOf(mime: string, dataUrl: string): "PNG" | "JPEG" {
  if (mime === "image/png" || dataUrl.startsWith("data:image/png")) return "PNG";
  return "JPEG";
}

// Redraws the image on a canvas: the cover-cropped centre when a ratio is given, else the whole image scaled to the width.
function redraw(img: HTMLImageElement, width: number, cropRatio: number | undefined, format: "PNG" | "JPEG"): PdfImage {
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  let sx = 0;
  let sy = 0;
  let cw = sw;
  let ch = sh;
  if (cropRatio && cropRatio > 0) {
    if (sw / sh > cropRatio) {
      cw = Math.round(sh * cropRatio);
      sx = Math.round((sw - cw) / 2);
    } else {
      ch = Math.round(sw / cropRatio);
      sy = Math.round((sh - ch) / 2);
    }
  }
  const outW = Math.max(1, Math.min(width, cw));
  const outH = Math.max(1, Math.round((outW * ch) / cw));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(img, sx, sy, cw, ch, 0, 0, outW, outH);
  const dataUrl = format === "PNG" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return { dataUrl, format, width: outW, height: outH };
}

// Fetches an image with the admin token and returns it as a data URL jsPDF can embed, with its pixel size.
export async function loadImageForPdf(url: string, opts?: LoadImageOptions): Promise<PdfImage> {
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status === 404 ? "Image absente" : `Image non chargée (${res.status})`, res.status, null);
  const blob = await res.blob();
  const dataUrl = await readAsDataUrl(blob);
  const img = await decode(dataUrl);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const maxWidth = opts?.maxWidth && opts.maxWidth > 0 ? Math.round(opts.maxWidth) : DEFAULT_MAX_WIDTH;
  if (opts?.cropRatio && opts.cropRatio > 0) return redraw(img, maxWidth, opts.cropRatio, "JPEG");
  const format = formatOf(blob.type, dataUrl);
  if (width > maxWidth) return redraw(img, maxWidth, undefined, format);
  return { dataUrl, format, width, height };
}

const brandCache = new Map<string, Promise<PdfImage | null>>();

// The logo or the banner for the PDF, null when none is set; one fetch per kind and settings version for the session.
export function brandImage(kind: BrandKind, version: string, opts?: LoadImageOptions): Promise<PdfImage | null> {
  const key = `${kind}|${version}|${opts?.cropRatio ?? ""}|${opts?.maxWidth ?? ""}`;
  const hit = brandCache.get(key);
  if (hit) return hit;
  const pending = loadImageForPdf(api.settings.brand.url(kind, version), opts).then(
    (image) => image,
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 404) return null;
      brandCache.delete(key);
      throw err;
    },
  );
  brandCache.set(key, pending);
  return pending;
}
