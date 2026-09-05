import type { AiMessage, AiToolCall, AiToolDefinition, AiUsage } from "../types";
import type { AiProvider } from "../provider";
import { AiProviderError } from "../errors";

export type AgentToolExecutor = (call: AiToolCall) => Promise<{
  content: string;
  isError?: boolean;
  /** Optional UI label for streaming status. */
  statusLabel?: string;
}>;

export type AgentStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; toolCallId: string; name: string; label?: string }
  | { type: "tool_end"; toolCallId: string; name: string; ok: boolean }
  | { type: "usage"; usage: AiUsage }
  | { type: "done"; assistantText: string }
  | { type: "error"; message: string; code?: string };

export type RunAgentInput = {
  provider: AiProvider;
  model: string;
  system: string;
  messages: AiMessage[];
  tools: AiToolDefinition[];
  executeTool: AgentToolExecutor;
  maxTurns?: number;
  maxToolCalls?: number;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  /** Prefer streaming when provider supports it. */
  stream?: boolean;
};

function emptyUsage(provider: string, model: string): AiUsage {
  return {
    provider,
    model,
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    reasoningTokens: null,
    toolCallCount: 0,
    latencyMs: 0,
    estimatedCostUsd: null,
  };
}

const EMPTY_ASSISTANT_FALLBACK =
  "El asistente no devolvió una respuesta. Probá de nuevo.";

function ensureAssistantText(text: string): { text: string; filled: boolean } {
  if (text.trim()) return { text, filled: false };
  return { text: EMPTY_ASSISTANT_FALLBACK, filled: true };
}

function mergeUsage(base: AiUsage, partial: Partial<AiUsage> | undefined, toolDelta = 0): AiUsage {
  if (!partial) {
    return { ...base, toolCallCount: base.toolCallCount + toolDelta };
  }
  const sumNullable = (a: number | null, b: number | null | undefined): number | null => {
    if (a == null && (b == null || b === undefined)) return null;
    return (a ?? 0) + (b ?? 0);
  };
  return {
    provider: partial.provider ?? base.provider,
    model: partial.model ?? base.model,
    inputTokens: sumNullable(base.inputTokens, partial.inputTokens),
    outputTokens: sumNullable(base.outputTokens, partial.outputTokens),
    cachedTokens: sumNullable(base.cachedTokens, partial.cachedTokens),
    reasoningTokens: sumNullable(base.reasoningTokens, partial.reasoningTokens),
    toolCallCount: base.toolCallCount + toolDelta + (partial.toolCallCount ?? 0),
    latencyMs: base.latencyMs,
    estimatedCostUsd: null,
  };
}

/**
 * Provider-agnostic tool loop. Tools are Bloqer-owned; provider only sees AiToolDefinition.
 */
export async function* runAgent(input: RunAgentInput): AsyncGenerator<AgentStreamEvent> {
  const started = Date.now();
  const maxTurns = input.maxTurns ?? 8;
  const maxToolCalls = input.maxToolCalls ?? 10;
  let usage = emptyUsage(input.provider.id, input.model);
  const history: AiMessage[] = [...input.messages];
  let assistantText = "";
  let toolCallsTotal = 0;

  if (input.tools.length && !input.provider.capabilities.supportsTools) {
    yield {
      type: "error",
      message: "El proveedor seleccionado no soporta herramientas.",
      code: "UNSUPPORTED",
    };
    return;
  }

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      if (input.signal?.aborted) {
        yield { type: "error", message: "Solicitud cancelada.", code: "TIMEOUT" };
        return;
      }

      const useStream = input.stream !== false && input.provider.capabilities.supportsStreaming;
      let toolCalls: AiToolCall[] = [];
      let turnText = "";

      if (useStream) {
        const { stream } = await input.provider.streamResponse({
          model: input.model,
          system: input.system,
          messages: history,
          tools: input.tools,
          temperature: input.temperature,
          maxOutputTokens: input.maxOutputTokens,
          signal: input.signal,
        });
        for await (const ev of stream) {
          if (ev.type === "text_delta") {
            turnText += ev.text;
            assistantText += ev.text;
            yield { type: "text_delta", text: ev.text };
          } else if (ev.type === "tool_calls_done") {
            toolCalls = ev.toolCalls;
          } else if (ev.type === "message_done") {
            toolCalls = ev.message.toolCalls ?? toolCalls;
            if (ev.message.content && !turnText) {
              turnText = ev.message.content;
              assistantText += ev.message.content;
              yield { type: "text_delta", text: ev.message.content };
            }
          } else if (ev.type === "usage") {
            usage = mergeUsage(usage, ev.usage);
          }
        }
      } else {
        const res = await input.provider.generateResponse({
          model: input.model,
          system: input.system,
          messages: history,
          tools: input.tools,
          temperature: input.temperature,
          maxOutputTokens: input.maxOutputTokens,
          signal: input.signal,
        });
        usage = mergeUsage(usage, res.usage);
        toolCalls = res.message.toolCalls ?? [];
        if (res.message.content) {
          turnText = res.message.content;
          assistantText += res.message.content;
          yield { type: "text_delta", text: res.message.content };
        }
      }

      history.push({
        role: "assistant",
        content: turnText || null,
        ...(toolCalls.length ? { toolCalls } : {}),
      });

      if (!toolCalls.length) {
        const ensured = ensureAssistantText(assistantText);
        if (ensured.filled) {
          assistantText = ensured.text;
          yield { type: "text_delta", text: assistantText };
        }
        usage = { ...usage, latencyMs: Date.now() - started, toolCallCount: toolCallsTotal };
        yield { type: "usage", usage };
        yield { type: "done", assistantText };
        return;
      }

      if (!input.provider.capabilities.supportsParallelTools && toolCalls.length > 1) {
        toolCalls = toolCalls.slice(0, 1);
      }

      for (const call of toolCalls) {
        if (toolCallsTotal >= maxToolCalls) {
          yield {
            type: "error",
            message: "Se alcanzó el límite de consultas del asistente para esta pregunta.",
            code: "BAD_REQUEST",
          };
          const ensured = ensureAssistantText(assistantText);
          if (ensured.filled) {
            assistantText = ensured.text;
            yield { type: "text_delta", text: assistantText };
          }
          usage = { ...usage, latencyMs: Date.now() - started, toolCallCount: toolCallsTotal };
          yield { type: "usage", usage };
          yield { type: "done", assistantText };
          return;
        }
        toolCallsTotal += 1;
        yield {
          type: "tool_start",
          toolCallId: call.id,
          name: call.name,
        };
        let ok = true;
        let resultContent: string;
        try {
          const result = await input.executeTool(call);
          resultContent = result.content;
          ok = !result.isError;
          if (result.statusLabel) {
            // Re-emit start with label for UI (optional refinement).
            yield {
              type: "tool_start",
              toolCallId: call.id,
              name: call.name,
              label: result.statusLabel,
            };
          }
        } catch (err) {
          ok = false;
          resultContent = JSON.stringify({
            error: err instanceof Error ? err.message : "Error al ejecutar herramienta",
          });
        }
        yield { type: "tool_end", toolCallId: call.id, name: call.name, ok };
        history.push({
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          content: resultContent,
        });
      }
    }

    yield {
      type: "error",
      message: "El asistente alcanzó el máximo de pasos sin una respuesta final.",
      code: "BAD_REQUEST",
    };
    const ensured = ensureAssistantText(assistantText);
    if (ensured.filled) {
      assistantText = ensured.text;
      yield { type: "text_delta", text: assistantText };
    }
    usage = { ...usage, latencyMs: Date.now() - started, toolCallCount: toolCallsTotal };
    yield { type: "usage", usage };
    yield { type: "done", assistantText };
  } catch (err) {
    const message =
      err instanceof AiProviderError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Error del asistente";
    yield {
      type: "error",
      message,
      code: err instanceof AiProviderError ? err.code : "UNKNOWN",
    };
    usage = { ...usage, latencyMs: Date.now() - started, toolCallCount: toolCallsTotal };
    yield { type: "usage", usage };
    // Don't emit text_delta here — client already applies the error message; avoid duplication.
    if (!assistantText.trim()) assistantText = message;
    yield { type: "done", assistantText };
  }
}
