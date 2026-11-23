import { AiProviderError, PURCHASE_REQUEST_AUDIO_MAX_BYTES, userFacingAiProviderErrorMessage } from "@bloqer/ai";
import { purchaseRequestAudioAvailable, transcribePurchaseRequestAudio, previewPurchaseRequestTranscript, ServiceError } from "@bloqer/services";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { AI_RATE_LIMIT_USER_MESSAGE, checkAiChatRateLimit } from "@/lib/ai-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const ctx = await buildTenantServiceContext();
  if (!ctx) return Response.json({ error: "Sesión requerida." }, { status: 401, headers });
  return Response.json({ enabled: purchaseRequestAudioAvailable() }, { headers });
}

async function boundedBody(req: Request, limit: number): Promise<Buffer> {
  if (!req.body || Number(req.headers.get("content-length")) > limit) throw new ServiceError("VALIDATION", "El contenido supera el límite permitido.");
  const reader = req.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new ServiceError("VALIDATION", "El contenido supera el límite permitido."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export async function POST(req: Request) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) return Response.json({ error: "Sesión requerida." }, { status: 401, headers });
  if ((req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) || req.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Origen no permitido." }, { status: 403, headers });
  }
  if (!purchaseRequestAudioAvailable()) return Response.json({ error: "La preparación por audio no está disponible." }, { status: 503, headers });
  const limit = checkAiChatRateLimit({ tenantId: ctx.tenantId, userId: ctx.actorUserId });
  if (!limit.ok) return Response.json({ error: AI_RATE_LIMIT_USER_MESSAGE }, { status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfterSec) } });
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.toLowerCase().startsWith("multipart/form-data;")) {
      const bytes = await boundedBody(req, PURCHASE_REQUEST_AUDIO_MAX_BYTES + 64 * 1024);
      let form: FormData;
      try { form = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": contentType } }).formData(); }
      catch { throw new ServiceError("VALIDATION", "El formulario de audio es inválido."); }
      if ([...form.keys()].some((key) => key !== "file" && key !== "projectId") || form.getAll("file").length !== 1 || form.getAll("projectId").length !== 1) throw new ServiceError("VALIDATION", "El formulario de audio es inválido.");
      const file = form.get("file"), projectId = form.get("projectId");
      if (!(file instanceof File) || typeof projectId !== "string") throw new ServiceError("VALIDATION", "Seleccioná un audio y una obra.");
      const transcript = await transcribePurchaseRequestAudio({ projectId, bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type, signal: req.signal }, ctx);
      return Response.json({ transcript }, { headers });
    }
    if (contentType.split(";")[0]?.trim().toLowerCase() !== "application/json") throw new ServiceError("VALIDATION", "Formato de solicitud inválido.");
    const json = (await boundedBody(req, 40_000)).toString("utf8");
    let body: unknown;
    try { body = JSON.parse(json); }
    catch { throw new ServiceError("VALIDATION", "El texto de la solicitud es inválido."); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "projectId" && key !== "transcript") || !("projectId" in body) || typeof body.projectId !== "string" || !("transcript" in body) || typeof body.transcript !== "string") throw new ServiceError("VALIDATION", "Revisá el texto y la obra.");
    const proposal = await previewPurchaseRequestTranscript({ projectId: body.projectId, transcript: body.transcript, signal: req.signal }, ctx);
    return Response.json({ proposal }, { headers });
  } catch (error) {
    if (error instanceof ServiceError) return Response.json({ error: error.message }, { status: error.code === "UNAUTHORIZED" ? 401 : error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400, headers });
    if (error instanceof AiProviderError) return Response.json({ error: userFacingAiProviderErrorMessage(error.code) }, { status: 502, headers });
    return Response.json({ error: "No se pudo preparar la solicitud. Podés continuar manualmente." }, { status: 500, headers });
  }
}
