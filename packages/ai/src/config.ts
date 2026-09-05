import { createOpenAiProvider } from "./providers/openai/openai-provider";
import {
  createFakeAiProvider,
  createConversationalFakeAiProvider,
  createFakeSecondaryProvider,
} from "./providers/fake/fake-provider";
import { defaultAiProviderRegistry } from "./provider-registry";
import type { AiProvider } from "./provider";
import { AiProviderError } from "./errors";
import { assertFakeProviderAllowed, getBloqerAiEnv } from "./env";

export { getBloqerAiEnv, isBloqerAiEnabled, assertFakeProviderAllowed, isFakeAiProviderId } from "./env";
export type { BloqerAiEnv } from "./env";

/** Register built-in adapters (idempotent). Provider SDKs load only when this runs. */
export function registerBuiltInAiProviders(): void {
  if (!defaultAiProviderRegistry.has("fake")) {
    defaultAiProviderRegistry.register("fake", () => {
      assertFakeProviderAllowed("fake");
      // Conversational fake: E2E/local UI can exercise tool_start + help text without a live LLM.
      return createConversationalFakeAiProvider({ id: "fake" });
    });
  }
  if (!defaultAiProviderRegistry.has("fake_secondary")) {
    defaultAiProviderRegistry.register("fake_secondary", () => {
      assertFakeProviderAllowed("fake_secondary");
      return createFakeSecondaryProvider();
    });
  }
  if (!defaultAiProviderRegistry.has("openai")) {
    defaultAiProviderRegistry.register("openai", () => {
      const env = getBloqerAiEnv();
      if (!env.openaiApiKey) {
        throw new AiProviderError("NOT_CONFIGURED", "OPENAI_API_KEY is required for provider openai", {
          providerId: "openai",
        });
      }
      return createOpenAiProvider({
        apiKey: env.openaiApiKey,
        baseUrl: env.baseUrl,
      });
    });
  }
}

export function createAiProviderFromEnv(): AiProvider {
  registerBuiltInAiProviders();
  const env = getBloqerAiEnv();
  assertFakeProviderAllowed(env.providerId);
  if (process.env.BLOQER_AI_E2E_FAIL === "1" && !isProductionLike()) {
    assertFakeProviderAllowed("fake");
    return createFakeAiProvider({
      id: "fake",
      failWith: { status: 500, message: "Simulated provider failure (E2E)" },
    });
  }
  return defaultAiProviderRegistry.create(env.providerId);
}

function isProductionLike(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.APP_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}
