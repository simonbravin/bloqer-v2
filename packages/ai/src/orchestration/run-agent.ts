import type { AiMessage, AiToolCall, AiToolDefinition, AiUsage } from "../types";
import type { AiProvider } from "../provider";
import { AiProviderError } from "../errors";
import {
  parseAiPresentationFromAssistantText,
  PRESENTATION_START,
  type AiPresentation,
} from "../presentation";

export type AgentToolExecutor = (call: AiToolCall) => Promise<{
  content: string;
  isError?: boolean;
  /** Optional UI label for streaming status. */
  statusLabel?: string;
  /** Trusted internal links from tool layer (never model-invented). */
  links?: { label: string; href: string }[];
}>;

export type AgentStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; toolCallId: string; name: string; label?: string }
  | {
      type: "tool_end";
      toolCallId: string;
      name: string;
      ok: boolean;
      links?: { label: string; href: string }[];
    }
  | { type: "usage"; usage: AiUsage }
  | { type: "presentation"; presentation: AiPresentation }
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

/** Merge trusted tool links into presentation insights/actions that lack links. */
function enrichPresentationWithToolLinks(
  presentation: AiPresentation,
  toolLinks: { label: string; href: string }[],
): AiPresentation {
  if (!toolLinks.length) return presentation;
  const unused = [...toolLinks];
  const take = (n: number) => unused.splice(0, n);

  const insights = presentation.insights.map((insight) => {
    if (insight.links.length > 0) return insight;
    const links = take(1);
    return links.length ? { ...insight, links } : insight;
  });
  const actions = presentation.actions.map((action) => {
    if (action.links.length > 0) return action;
    const links = take(1);
    return links.length ? { ...action, links } : action;
  });
  return { ...presentation, insights, actions };
}

function finalizeAssistantOutput(
  rawText: string,
  toolLinks: { label: string; href: string }[],
): { visibleText: string; presentation: AiPresentation | null } {
  const parsed = parseAiPresentationFromAssistantText(rawText);
  let presentation = parsed.presentation;
  if (presentation) {
    presentation = enrichPresentationWithToolLinks(presentation, toolLinks);
  }
  let visibleText = parsed.visibleText.trim();
  if (!visibleText && presentation) {
    visibleText = [presentation.headline, presentation.summary].filter(Boolean).join(" — ");
  }
  const ensured = ensureAssistantText(visibleText);
  return { visibleText: ensured.text, presentation };
}

function createPresentationAwareStreamer() {
  let raw = "";
  let visibleEmittedLen = 0;
  let fenceStarted = false;
  const deltas: string[] = [];

  return {
    push(chunk: string) {
      raw += chunk;
      if (fenceStarted) return;
      const idx = raw.indexOf(PRESENTATION_START);
      if (idx >= 0) {
        fenceStarted = true;
        if (idx > visibleEmittedLen) {
          deltas.push(raw.slice(visibleEmittedLen, idx));
          visibleEmittedLen = idx;
        }
        return;
      }
      const hold = Math.min(PRESENTATION_START.length - 1, raw.length);
      const safeEnd = raw.length - hold;
      if (safeEnd > visibleEmittedLen) {
        deltas.push(raw.slice(visibleEmittedLen, safeEnd));
        visibleEmittedLen = safeEnd;
      }
    },
    flushHeld() {
      if (fenceStarted) return;
      if (raw.length > visibleEmittedLen) {
        deltas.push(raw.slice(visibleEmittedLen));
        visibleEmittedLen = raw.length;
      }
    },
    takeDeltas(): string[] {
      return deltas.splice(0, deltas.length);
    },
    rawText: () => raw,
  };
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
    const collectedToolLinks: { label: string; href: string }[] = [];
    const seenLinkHrefs = new Set<string>();

    for (let turn = 0; turn < maxTurns; turn++) {
      if (input.signal?.aborted) {
        yield { type: "error", message: "Solicitud cancelada.", code: "TIMEOUT" };
        return;
      }

      const useStream = input.stream !== false && input.provider.capabilities.supportsStreaming;
      let toolCalls: AiToolCall[] = [];
      let turnText = "";
      const streamer = createPresentationAwareStreamer();

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
            streamer.push(ev.text);
            for (const d of streamer.takeDeltas()) {
              assistantText += d;
              yield { type: "text_delta", text: d };
            }
          } else if (ev.type === "tool_calls_done") {
            toolCalls = ev.toolCalls;
          } else if (ev.type === "message_done") {
            toolCalls = ev.message.toolCalls ?? toolCalls;
            if (ev.message.content && !streamer.rawText()) {
              streamer.push(ev.message.content);
              for (const d of streamer.takeDeltas()) {
                assistantText += d;
                yield { type: "text_delta", text: d };
              }
            }
          } else if (ev.type === "usage") {
            usage = mergeUsage(usage, ev.usage);
          }
        }
        if (!toolCalls.length) streamer.flushHeld();
        for (const d of streamer.takeDeltas()) {
          assistantText += d;
          yield { type: "text_delta", text: d };
        }
        turnText = streamer.rawText();
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
          streamer.push(res.message.content);
          if (!toolCalls.length) streamer.flushHeld();
          for (const d of streamer.takeDeltas()) {
            assistantText += d;
            yield { type: "text_delta", text: d };
          }
        }
      }

      history.push({
        role: "assistant",
        content: turnText || null,
        ...(toolCalls.length ? { toolCalls } : {}),
      });

      if (!toolCalls.length) {
        const finalized = finalizeAssistantOutput(
          turnText || assistantText,
          collectedToolLinks,
        );
        // Replace streamed visible with finalized (fence stripped)
        assistantText = finalized.visibleText;
        usage = { ...usage, latencyMs: Date.now() - started, toolCallCount: toolCallsTotal };
        yield { type: "usage", usage };
        if (finalized.presentation) {
          yield { type: "presentation", presentation: finalized.presentation };
        }
        yield { type: "done", assistantText: finalized.visibleText };
        return;
      }

      // Tool turn: keep raw assistant text for history; visible streaming already happened
      assistantText = ""; // reset visible accumulator for next (final) turn
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
          const finalized = finalizeAssistantOutput(
            streamer.rawText() || EMPTY_ASSISTANT_FALLBACK,
            collectedToolLinks,
          );
          usage = { ...usage, latencyMs: Date.now() - started, toolCallCount: toolCallsTotal };
          yield { type: "usage", usage };
          if (finalized.presentation) {
            yield { type: "presentation", presentation: finalized.presentation };
          }
          yield { type: "done", assistantText: finalized.visibleText };
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
        let resultLinks: { label: string; href: string }[] | undefined;
        try {
          const result = await input.executeTool(call);
          resultContent = result.content;
          ok = !result.isError;
          if (result.links?.length) resultLinks = result.links;
          if (result.statusLabel) {
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
        if (resultLinks?.length) {
          for (const link of resultLinks) {
            if (seenLinkHrefs.has(link.href)) continue;
            seenLinkHrefs.add(link.href);
            collectedToolLinks.push(link);
          }
        }
        yield {
          type: "tool_end",
          toolCallId: call.id,
          name: call.name,
          ok,
          ...(resultLinks?.length ? { links: resultLinks } : {}),
        };
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
    const finalized = finalizeAssistantOutput(
      assistantText || EMPTY_ASSISTANT_FALLBACK,
      collectedToolLinks,
    );
    usage = { ...usage, latencyMs: Date.now() - started, toolCallCount: toolCallsTotal };
    yield { type: "usage", usage };
    if (finalized.presentation) {
      yield { type: "presentation", presentation: finalized.presentation };
    }
    yield { type: "done", assistantText: finalized.visibleText };
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
    if (!assistantText.trim()) assistantText = message;
    yield { type: "done", assistantText };
  }
}
