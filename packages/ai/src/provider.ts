import type {
  AiGenerateRequest,
  AiGenerateResponse,
  AiProviderCapabilities,
  AiStreamResponse,
} from "./types";

/**
 * Vendor-neutral LLM provider. Implementations live under `providers/*`
 * and must not leak vendor types into the rest of `@bloqer/ai`.
 */
export interface AiProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: AiProviderCapabilities;

  generateResponse(request: AiGenerateRequest): Promise<AiGenerateResponse>;

  streamResponse(request: AiGenerateRequest): Promise<AiStreamResponse>;
}
