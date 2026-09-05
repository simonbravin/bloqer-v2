export type * from "./types";
export { AiProviderError } from "./errors";
export type { AiProviderErrorCode } from "./errors";
export type { AiProvider } from "./provider";
export { AiProviderRegistry, defaultAiProviderRegistry } from "./provider-registry";
export { runAgent } from "./orchestration/run-agent";
export type { AgentStreamEvent, AgentToolExecutor, RunAgentInput } from "./orchestration/run-agent";
export { buildBloqerAiSystemPrompt } from "./policy/system-prompt";
export {
  getBloqerAiEnv,
  isBloqerAiEnabled,
  createAiProviderFromEnv,
  registerBuiltInAiProviders,
  assertFakeProviderAllowed,
} from "./config";
export type { BloqerAiEnv } from "./config";
export { resolveBloqerAiEnabled, isFakeAiProviderId } from "./env";
export { createOpenAiProvider } from "./providers/openai/openai-provider";
export {
  createFakeAiProvider,
  createFakeSecondaryProvider,
  createConversationalFakeAiProvider,
} from "./providers/fake/fake-provider";
export {
  loadKnowledgeIndex,
  getLoadedKnowledgeIndex,
  searchKnowledge,
  ensureBundledKnowledgeLoaded,
  buildBm25Index,
  searchBm25,
} from "./knowledge";
export type { KnowledgeChunk, KnowledgeIndex, KnowledgeHit } from "./knowledge";
