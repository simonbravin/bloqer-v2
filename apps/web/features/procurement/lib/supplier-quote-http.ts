import { createHash } from "node:crypto";
import { getPublicAppBaseUrl, supplierQuoteLinksEnabled } from "@bloqer/config";
import { ServiceError } from "@bloqer/services";
import { NextRequest, NextResponse } from "next/server";

export const supplierQuoteHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
};
export const supplierQuoteCookie = (id: string) => `supplier-quote-${id}`;
export const supplierQuoteJson = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: supplierQuoteHeaders });
const attempts = new Map<string, { count: number; until: number }>();

/** Bounded process-local protection. Database/token checks remain authoritative. */
export function guardSupplierQuoteRequest(request: NextRequest) {
  if (!supplierQuoteLinksEnabled()) throw new ServiceError("NOT_FOUND", "El enlace no está disponible.");
  const expectedOrigin = getPublicAppBaseUrl();
  if (!expectedOrigin || (request.method !== "GET" && request.headers.get("origin") !== expectedOrigin) ||
      ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "")) {
    throw new ServiceError("FORBIDDEN", "La solicitud no es válida.");
  }
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
  const key = createHash("sha256").update(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown").digest("hex");
  const entry = attempts.get(key);
  if (!entry && attempts.size >= 2000) throw new ServiceError("CONFLICT", "Esperá un minuto e intentá de nuevo.");
  if (entry && ++entry.count > 60) throw new ServiceError("CONFLICT", "Esperá un minuto e intentá de nuevo.");
  if (!entry) attempts.set(key, { count: 1, until: now + 60_000 });
}

export async function readSupplierQuoteBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new ServiceError("VALIDATION", "Formato inválido.");
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError("VALIDATION", "Faltan datos.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256 * 1024) { await reader.cancel(); throw new ServiceError("VALIDATION", "La respuesta es demasiado grande."); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new ServiceError("VALIDATION", "Formato inválido."); }
  } finally { reader.releaseLock(); }
}

export function supplierQuoteHttpError(error: unknown) {
  if (error instanceof ServiceError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : 400;
    return supplierQuoteJson({ error: error.code === "NOT_FOUND" ? "El enlace no está disponible. Pedí un nuevo enlace a Compras." : error.message }, status);
  }
  // No payload, cookie or token is logged or reflected.
  return supplierQuoteJson({ error: "No pudimos completar la operación. Intentá de nuevo." }, 500);
}
