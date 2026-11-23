import { z } from "zod";
import {
  createAiProviderFromEnv, getBloqerAiEnv, getPurchaseRequestTranscriptionModel,
  isPurchaseRequestAudioEnabled, preparePurchaseRequestTranscript,
  PURCHASE_REQUEST_AUDIO_MAX_BYTES, validatePurchaseRequestTranscript, type AiProvider,
} from "@bloqer/ai";
import { ServiceError, type ServiceContext } from "../types";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { isCrossCompany } from "../company-scope";
import { canEditPurchaseRequests } from "./procurement-access";

type Dependencies = {
  enabled: typeof isPurchaseRequestAudioEnabled;
  assertModule: typeof assertProcurementTenantModule;
  assertProject: typeof assertProjectAllowsOperationalMutation;
  provider: () => AiProvider;
  config: typeof getBloqerAiEnv;
  transcriptionModel: typeof getPurchaseRequestTranscriptionModel;
};
const defaults: Dependencies = {
  enabled: isPurchaseRequestAudioEnabled, assertModule: assertProcurementTenantModule,
  assertProject: assertProjectAllowsOperationalMutation, provider: createAiProviderFromEnv,
  config: getBloqerAiEnv, transcriptionModel: getPurchaseRequestTranscriptionModel,
};

export function purchaseRequestAudioAvailable(): boolean {
  if (!isPurchaseRequestAudioEnabled()) return false;
  try {
    const provider = createAiProviderFromEnv();
    return Boolean(provider.transcribeAudio && provider.capabilities.supportsStructuredOutput);
  } catch { return false; }
}

async function authorize(projectId: string, ctx: ServiceContext, deps: Dependencies) {
  if (!ctx.actorUserId || !ctx.tenantId) throw new ServiceError("UNAUTHORIZED", "Sesión requerida.");
  if (!deps.enabled()) throw new ServiceError("FORBIDDEN", "La preparación por audio no está habilitada.");
  if (!z.string().guid().safeParse(projectId).success) throw new ServiceError("VALIDATION", "Proyecto inválido.");
  await deps.assertModule(ctx);
  if (!canEditPurchaseRequests(ctx.roles)) throw new ServiceError("FORBIDDEN", "Sin permiso para preparar solicitudes.");
  const project = await deps.assertProject(projectId, ctx);
  if (isCrossCompany(project.companyId, ctx)) throw new ServiceError("FORBIDDEN", "La obra no pertenece a la empresa activa.");
  if (!ctx.companyId && !project.companyId) throw new ServiceError("VALIDATION", "Elegí una empresa para preparar la solicitud.");
}

function boundedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(Math.min(timeoutMs, 55_000));
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function validatePurchaseRequestAudio(bytes: Uint8Array, declaredMime: string): "audio/webm" | "audio/mp4" | "audio/wav" {
  if (!bytes.length || bytes.length > PURCHASE_REQUEST_AUDIO_MAX_BYTES) throw new ServiceError("VALIDATION", "Elegí un audio de hasta 3 MiB.");
  const mime = declaredMime.split(";")[0]!.trim().toLowerCase();
  const buffer = Buffer.from(bytes);
  const valid = mime === "audio/webm" ? buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    : mime === "audio/mp4" ? buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp"
    : mime === "audio/wav" ? buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE"
    : false;
  if (!valid) throw new ServiceError("VALIDATION", "El archivo debe ser audio WebM, MP4 o WAV válido.");
  return mime as "audio/webm" | "audio/mp4" | "audio/wav";
}

/** No creation path: authorization always precedes provider work. */
export async function transcribePurchaseRequestAudio(input: {
  projectId: string; bytes: Uint8Array; mimeType: string; signal?: AbortSignal;
}, ctx: ServiceContext, deps: Dependencies = defaults): Promise<string> {
  await authorize(input.projectId, ctx, deps);
  const mimeType = validatePurchaseRequestAudio(input.bytes, input.mimeType);
  const provider = deps.provider();
  if (!provider.transcribeAudio) throw new ServiceError("VALIDATION", "El proveedor no admite transcripción. Podés escribir el texto.");
  const signal = boundedSignal(input.signal, deps.config().timeoutMs);
  signal.throwIfAborted();
  const transcript = await provider.transcribeAudio({ model: deps.transcriptionModel(), bytes: input.bytes, mimeType, signal });
  signal.throwIfAborted();
  return validatePurchaseRequestTranscript(transcript);
}

export async function previewPurchaseRequestTranscript(input: {
  projectId: string; transcript: string; signal?: AbortSignal;
}, ctx: ServiceContext, deps: Dependencies = defaults) {
  await authorize(input.projectId, ctx, deps);
  const transcript = validatePurchaseRequestTranscript(input.transcript);
  const config = deps.config();
  return preparePurchaseRequestTranscript({
    provider: deps.provider(), model: config.model, transcript,
    signal: boundedSignal(input.signal, config.timeoutMs),
  });
}
