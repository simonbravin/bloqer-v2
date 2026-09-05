import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { AiProvider } from "../../provider";
import { AiProviderError } from "../../errors";
import type {
  AiGenerateRequest,
  AiGenerateResponse,
  AiMessage,
  AiStreamEvent,
  AiStreamResponse,
  AiToolCall,
  AiToolDefinition,
} from "../../types";

function toOpenAiMessages(system: string | undefined, messages: AiMessage[]): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  if (system?.trim()) {
    out.push({ role: "system", content: system });
  }
  for (const m of messages) {
    if (m.role === "system") {
      out.push({ role: "system", content: m.content });
      continue;
    }
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.argumentsJson },
              })),
            }
          : {}),
      });
      continue;
    }
    out.push({
      role: "tool",
      tool_call_id: m.toolCallId,
      content: m.content,
    });
  }
  return out;
}

function toOpenAiTools(tools: AiToolDefinition[] | undefined): ChatCompletionTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function mapFinishReason(reason: string | null | undefined): AiGenerateResponse["finishReason"] {
  switch (reason) {
    case "stop":
      return "stop";
    case "tool_calls":
      return "tool_calls";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    default:
      return reason ? "unknown" : "unknown";
  }
}

function mapOpenAiToolCalls(
  raw: Array<{ id: string; type?: string; function?: { name?: string; arguments?: string } }> | null | undefined,
): AiToolCall[] | undefined {
  if (!raw?.length) return undefined;
  const out: AiToolCall[] = [];
  for (const tc of raw) {
    // Newer OpenAI shapes may include non-function tool call variants.
    if (tc.type && tc.type !== "function") continue;
    const name = tc.function?.name?.trim();
    if (!tc.id || !name) continue;
    out.push({
      id: tc.id,
      name,
      argumentsJson: tc.function?.arguments ?? "{}",
    });
  }
  return out.length ? out : undefined;
}

function wrapProviderError(err: unknown, providerId: string): never {
  if (err instanceof AiProviderError) throw err;

  // OpenAI SDK abort/timeout classes often have no HTTP status.
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : "Provider error";
  if (
    name === "APIUserAbortError" ||
    name === "AbortError" ||
    /aborted|abort/i.test(message)
  ) {
    throw new AiProviderError("TIMEOUT", "Solicitud cancelada.", {
      providerId,
      retryable: false,
      cause: err,
    });
  }
  if (
    name === "APIConnectionTimeoutError" ||
    /timed?\s*out|timeout/i.test(message)
  ) {
    throw new AiProviderError("TIMEOUT", "Timeout del proveedor de AI.", {
      providerId,
      retryable: true,
      cause: err,
    });
  }

  const anyErr = err as { status?: number; code?: string; message?: string };
  const status = anyErr.status;
  const detail = anyErr.message ?? message;
  if (status === 401 || status === 403) {
    throw new AiProviderError("AUTH", detail, { providerId, retryable: false, cause: err });
  }
  if (status === 429) {
    throw new AiProviderError("RATE_LIMIT", detail, { providerId, retryable: true, cause: err });
  }
  if (status === 400) {
    throw new AiProviderError("BAD_REQUEST", detail, { providerId, retryable: false, cause: err });
  }
  throw new AiProviderError("PROVIDER", detail, {
    providerId,
    retryable: Boolean(status && status >= 500),
    cause: err,
  });
}

function assistantVisibleText(message: {
  content?: string | null;
  refusal?: string | null;
}): string | null {
  const content = message.content?.trim() ? message.content : null;
  if (content) return content;
  const refusal = message.refusal?.trim() ? message.refusal : null;
  return refusal;
}

export type OpenAiProviderOptions = {
  apiKey: string;
  /** Optional OpenAI-compatible base URL (OpenRouter, Groq, local, etc.). */
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
};

/**
 * First MVP adapter: OpenAI Chat Completions (+ optional compatible baseURL).
 * Vendor types stay inside this file; callers only see AiProvider.
 */
export function createOpenAiProvider(opts: OpenAiProviderOptions): AiProvider {
  const providerId = "openai";
  if (!opts.apiKey.trim()) {
    throw new AiProviderError("NOT_CONFIGURED", "OPENAI_API_KEY is missing", { providerId });
  }

  const client = new OpenAI({
    apiKey: opts.apiKey,
    ...(opts.baseUrl ? { baseURL: opts.baseUrl } : {}),
    ...(opts.defaultHeaders ? { defaultHeaders: opts.defaultHeaders } : {}),
  });

  return {
    id: providerId,
    displayName: "OpenAI",
    capabilities: {
      supportsTools: true,
      supportsParallelTools: true,
      supportsStreaming: true,
      supportsStructuredOutput: true,
      supportsReasoning: false,
      supportsVision: true,
    },

    async generateResponse(request: AiGenerateRequest): Promise<AiGenerateResponse> {
      try {
        const completion = await client.chat.completions.create(
          {
            model: request.model,
            messages: toOpenAiMessages(request.system, request.messages),
            tools: toOpenAiTools(request.tools),
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
            // GPT-5.x rejects max_tokens; max_completion_tokens works on 4.x and 5.x.
            ...(request.maxOutputTokens !== undefined
              ? { max_completion_tokens: request.maxOutputTokens }
              : {}),
          },
          { signal: request.signal },
        );
        const choice = completion.choices[0];
        if (!choice) {
          throw new AiProviderError("PROVIDER", "Empty completion from OpenAI", { providerId });
        }
        const toolCalls = mapOpenAiToolCalls(choice.message.tool_calls);
        const visible = assistantVisibleText(choice.message);
        return {
          message: {
            role: "assistant",
            content: visible,
            ...(toolCalls?.length ? { toolCalls } : {}),
          },
          finishReason: mapFinishReason(choice.finish_reason),
          usage: {
            provider: providerId,
            model: request.model,
            inputTokens: completion.usage?.prompt_tokens ?? null,
            outputTokens: completion.usage?.completion_tokens ?? null,
            cachedTokens: null,
            reasoningTokens: null,
          },
        };
      } catch (err) {
        wrapProviderError(err, providerId);
      }
    },

    async streamResponse(request: AiGenerateRequest): Promise<AiStreamResponse> {
      const stream = (async function* (): AsyncGenerator<AiStreamEvent> {
        try {
          const completion = await client.chat.completions.create(
            {
              model: request.model,
              messages: toOpenAiMessages(request.system, request.messages),
              tools: toOpenAiTools(request.tools),
              ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
              ...(request.maxOutputTokens !== undefined
                ? { max_completion_tokens: request.maxOutputTokens }
                : {}),
              stream: true,
              stream_options: { include_usage: true },
            },
            { signal: request.signal },
          );

          let content = "";
          let refusalText = "";
          const toolAcc = new Map<number, { id: string; name: string; argumentsJson: string }>();
          let finishReason: AiGenerateResponse["finishReason"] = "unknown";

          for await (const chunk of completion) {
            const choice = chunk.choices[0];
            if (chunk.usage) {
              yield {
                type: "usage",
                usage: {
                  provider: providerId,
                  model: request.model,
                  inputTokens: chunk.usage.prompt_tokens ?? null,
                  outputTokens: chunk.usage.completion_tokens ?? null,
                  cachedTokens: null,
                  reasoningTokens: null,
                },
              };
            }
            if (!choice) continue;
            if (choice.finish_reason) {
              finishReason = mapFinishReason(choice.finish_reason);
            }
            const delta = choice.delta;
            if (delta?.content) {
              content += delta.content;
              yield { type: "text_delta", text: delta.content };
            }
            // Some models surface refusals on the final message / delta.
            const deltaRefusal = (delta as { refusal?: string | null } | undefined)?.refusal;
            if (deltaRefusal) refusalText += deltaRefusal;
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                const prev = toolAcc.get(idx) ?? { id: "", name: "", argumentsJson: "" };
                if (tc.id) prev.id = tc.id;
                if (tc.function?.name) prev.name = tc.function.name;
                if (tc.function?.arguments) prev.argumentsJson += tc.function.arguments;
                toolAcc.set(idx, prev);
                yield {
                  type: "tool_call_delta",
                  toolCallId: prev.id || `pending_${idx}`,
                  name: prev.name || undefined,
                  argumentsJsonDelta: tc.function?.arguments,
                };
              }
            }
          }

          const toolCalls: AiToolCall[] = [...toolAcc.values()]
            .filter((t) => t.id && t.name)
            .map((t) => ({ id: t.id, name: t.name, argumentsJson: t.argumentsJson || "{}" }));

          if (toolCalls.length) {
            yield { type: "tool_calls_done", toolCalls };
          }

          const visible =
            assistantVisibleText({ content: content || null, refusal: refusalText || null }) ?? null;
          if (!content && visible) {
            yield { type: "text_delta", text: visible };
          }

          yield {
            type: "message_done",
            message: {
              role: "assistant",
              content: visible,
              ...(toolCalls.length ? { toolCalls } : {}),
            },
            finishReason: toolCalls.length ? "tool_calls" : finishReason,
          };
        } catch (err) {
          wrapProviderError(err, providerId);
        }
      })();

      return { stream };
    },
  };
}
