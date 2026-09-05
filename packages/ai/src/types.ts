/**
 * Provider-agnostic AI protocol types for Bloqer.
 * Adapters convert these ↔ vendor formats. Tools never import provider SDKs.
 */

export type AiRole = "system" | "user" | "assistant" | "tool";

/** JSON-serializable tool argument / result payloads. */
export type AiJsonValue =
  | string
  | number
  | boolean
  | null
  | AiJsonValue[]
  | { [key: string]: AiJsonValue };

export type AiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: AiToolCall[] }
  | { role: "tool"; toolCallId: string; toolName: string; content: string };

export type AiToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema object for parameters (vendor-neutral). */
  parameters: Record<string, unknown>;
};

export type AiToolCall = {
  id: string;
  name: string;
  /** Raw JSON string from the model (parse in orchestrator). */
  argumentsJson: string;
};

export type AiToolResultPayload = {
  toolCallId: string;
  toolName: string;
  /** Stringified JSON or plain text for the model. */
  content: string;
  isError?: boolean;
};

export type AiUsage = {
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  toolCallCount: number;
  latencyMs: number;
  /** USD estimate when a price table exists; otherwise null (unknown). */
  estimatedCostUsd: number | null;
};

export type AiModelConfig = {
  providerId: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
};

export type AiFinishReason =
  | "stop"
  | "tool_calls"
  | "length"
  | "content_filter"
  | "error"
  | "unknown";

export type AiProviderCapabilities = {
  supportsTools: boolean;
  supportsParallelTools: boolean;
  supportsStreaming: boolean;
  supportsStructuredOutput: boolean;
  supportsReasoning: boolean;
  supportsVision: boolean;
};

export type AiGenerateRequest = {
  model: string;
  system?: string;
  messages: AiMessage[];
  tools?: AiToolDefinition[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type AiGenerateResponse = {
  message: Extract<AiMessage, { role: "assistant" }>;
  finishReason: AiFinishReason;
  usage: Partial<AiUsage>;
  rawProviderMeta?: Record<string, unknown>;
};

export type AiStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call_delta"; toolCallId: string; name?: string; argumentsJsonDelta?: string }
  | { type: "tool_calls_done"; toolCalls: AiToolCall[] }
  | { type: "message_done"; message: Extract<AiMessage, { role: "assistant" }>; finishReason: AiFinishReason }
  | { type: "usage"; usage: Partial<AiUsage> };

export type AiStreamResponse = {
  stream: AsyncIterable<AiStreamEvent>;
};
