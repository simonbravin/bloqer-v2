import { AiProviderError, SUPPLIER_INVOICE_PREVIEW_MAX_BYTES, userFacingAiProviderErrorMessage } from "@bloqer/ai";
import { previewProcurementQuoteDocument, ServiceError, procurementQuoteDocumentAvailable } from "@bloqer/services";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { AI_RATE_LIMIT_USER_MESSAGE, checkAiChatRateLimit } from "@/lib/ai-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const ctx = await buildTenantServiceContext();
  if (!ctx) return Response.json({ error: "Sesión requerida." }, { status: 401, headers });
  return Response.json({ enabled: procurementQuoteDocumentAvailable() }, { headers });
}

/** Bound the body even without Content-Length, before the multipart parser allocates it. */
async function readFormData(req: Request): Promise<FormData> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new ServiceError("VALIDATION", "Enviá una cotización mediante el formulario.");
  }
  const maxBody = SUPPLIER_INVOICE_PREVIEW_MAX_BYTES + 64 * 1024;
  const length = Number(req.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBody) throw new ServiceError("VALIDATION", "Elegí una cotización de hasta 3 MiB.");
  if (!req.body) throw new ServiceError("VALIDATION", "Falta la cotización.");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBody) {
        await reader.cancel();
        throw new ServiceError("VALIDATION", "Elegí una cotización de hasta 3 MiB.");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Response(Buffer.concat(chunks), { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new ServiceError("VALIDATION", "No se pudo leer el formulario dla cotización.");
  }
}

export async function POST(req: Request) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) return Response.json({ error: "Sesión requerida." }, { status: 401, headers });
  const origin = req.headers.get("origin");
  if ((origin && origin !== new URL(req.url).origin) || req.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Origen no permitido." }, { status: 403, headers });
  }
  if (!procurementQuoteDocumentAvailable()) {
    return Response.json({ error: "La lectura de cotizaciones con IA no está disponible." }, { status: 503, headers });
  }
  const limit = checkAiChatRateLimit({ tenantId: ctx.tenantId, userId: ctx.actorUserId });
  if (!limit.ok) return Response.json({ error: AI_RATE_LIMIT_USER_MESSAGE }, {
    status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfterSec) },
  });
  try {
    const form = await readFormData(req);
    if ([...form.keys()].some((key) => key !== "file" && key !== "projectId" && key !== "purchaseRequestId") ||
      form.getAll("file").length !== 1 || form.getAll("projectId").length !== 1 || form.getAll("purchaseRequestId").length !== 1) {
      throw new ServiceError("VALIDATION", "El formulario dla cotización es inválido.");
    }
    const file = form.get("file");
    const project = form.get("projectId");
    const purchaseRequestId = form.get("purchaseRequestId");
    if (!(file instanceof File) || typeof project !== "string" || typeof purchaseRequestId !== "string") {
      throw new ServiceError("VALIDATION", "Seleccioná una cotización válida.");
    }
    const preview = await previewProcurementQuoteDocument({
      projectId: project.trim(), purchaseRequestId: purchaseRequestId.trim(),
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      signal: req.signal,
    }, ctx);
    return Response.json({ preview }, { headers });
  } catch (error) {
    if (error instanceof ServiceError) return Response.json({ error: error.message }, {
      status: error.code === "UNAUTHORIZED" ? 401 : error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400,
      headers,
    });
    if (error instanceof AiProviderError) return Response.json({ error: userFacingAiProviderErrorMessage(error.code) }, { status: 502, headers });
    // Never log a file, extraction, provider payload, or raw error to shared telemetry.
    return Response.json({ error: "No se pudo leer la cotización. Podés continuar con la carga manual." }, { status: 500, headers });
  }
}

