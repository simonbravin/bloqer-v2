import { ServiceError } from "../types";

export const UPLOAD_CONTENT_MISMATCH_MESSAGE =
  "El contenido del archivo no coincide con un formato permitido.";

const HEIC_FAMILY = new Set(["image/heic", "image/heif"]);

/** ISO BMFF brands used by HEIC/HEIF (incl. typical iPhone stills). Not a full parser. */
const HEIC_FTYP_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

/**
 * ZIP-based Office and plain text cannot be sniffed reliably without a second
 * parser (docx/xlsx are PKZip). Declared MIME + size/extension remain the gate.
 */
const SKIP_BYTE_SNIFF = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

export function isByteSniffSkippedMime(mimeType: string): boolean {
  return SKIP_BYTE_SNIFF.has(mimeType);
}

function sniffHeicByFtyp(content: Buffer): "image/heic" | "image/heif" | undefined {
  if (content.length < 12) return undefined;
  if (content.subarray(4, 8).toString("ascii") !== "ftyp") return undefined;
  const brands: string[] = [content.subarray(8, 12).toString("ascii")];
  for (let offset = 16; offset + 4 <= Math.min(content.length, 64); offset += 4) {
    brands.push(content.subarray(offset, offset + 4).toString("ascii"));
  }
  const hit = brands.find((brand) => HEIC_FTYP_BRANDS.has(brand));
  if (!hit) return undefined;
  if (hit === "mif1" || hit === "msf1") return "image/heif";
  return "image/heic";
}

export function declaredMimeMatchesSniffed(declaredMime: string, sniffedMime: string): boolean {
  if (declaredMime === sniffedMime) return true;
  return HEIC_FAMILY.has(declaredMime) && HEIC_FAMILY.has(sniffedMime);
}

export async function sniffAllowedUploadMime(content: Buffer): Promise<string | undefined> {
  if (content.length === 0) return undefined;
  const { fileTypeFromBuffer } = await import("file-type");
  const detected = await fileTypeFromBuffer(content);
  if (detected?.mime) return detected.mime;
  return sniffHeicByFtyp(content);
}

/**
 * JPEG / PNG / WebP / PDF / HEIC / HEIF: bytes must match the declared family.
 * Office / CSV / TXT: no byte sniff (see SKIP_BYTE_SNIFF).
 */
export async function assertUploadContentMatchesDeclaredMime(
  content: Buffer,
  declaredMime: string,
): Promise<void> {
  if (content.length === 0) {
    throw new ServiceError("VALIDATION", "El archivo está vacío");
  }
  if (isByteSniffSkippedMime(declaredMime)) return;

  const sniffed = await sniffAllowedUploadMime(content);
  if (!sniffed || !declaredMimeMatchesSniffed(declaredMime, sniffed)) {
    throw new ServiceError("VALIDATION", UPLOAD_CONTENT_MISMATCH_MESSAGE);
  }
}
