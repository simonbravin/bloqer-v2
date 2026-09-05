import type {
  AiGenerateRequest,
  AiGenerateResponse,
  AiMessage,
  AiStreamEvent,
  AiStreamResponse,
  AiToolCall,
} from "../../types";
import type { AiProvider } from "../../provider";

export type FakeAiScriptedTurn =
  | { kind: "text"; text: string }
  | { kind: "tool_calls"; toolCalls: AiToolCall[] };

/**
 * Deterministic provider for tests — proves orchestrator/tools/UI do not need OpenAI.
 */
export function createFakeAiProvider(opts?: {
  id?: string;
  /** Scripted turns in order; last turn repeats if exhausted unless infiniteTools. */
  turns?: FakeAiScriptedTurn[];
  /** If true, always returns tool_calls (for max-loop tests). */
  infiniteTools?: boolean;
  failWith?: { status: number; message: string };
}): AiProvider {
  const id = opts?.id ?? "fake";
  let turnIdx = 0;
  const turns = opts?.turns ?? [{ kind: "text", text: "OK (fake)" }];

  function nextTurn(): FakeAiScriptedTurn {
    if (opts?.infiniteTools) {
      return {
        kind: "tool_calls",
        toolCalls: [
          {
            id: `call_loop_${turnIdx++}`,
            name: "get_current_context",
            argumentsJson: "{}",
          },
        ],
      };
    }
    const t = turns[Math.min(turnIdx, turns.length - 1)]!;
    turnIdx += 1;
    return t;
  }

  function toResponse(request: AiGenerateRequest): AiGenerateResponse {
    if (opts?.failWith) {
      const err = new Error(opts.failWith.message) as Error & { status: number };
      err.status = opts.failWith.status;
      throw err;
    }
    const turn = nextTurn();
    if (turn.kind === "tool_calls") {
      return {
        message: { role: "assistant", content: null, toolCalls: turn.toolCalls },
        finishReason: "tool_calls",
        usage: {
          provider: id,
          model: request.model,
          inputTokens: 10,
          outputTokens: 5,
          cachedTokens: null,
          reasoningTokens: null,
        },
      };
    }
    return {
      message: { role: "assistant", content: turn.text },
      finishReason: "stop",
      usage: {
        provider: id,
        model: request.model,
        inputTokens: 10,
        outputTokens: turn.text.length,
        cachedTokens: null,
        reasoningTokens: null,
      },
    };
  }

  return {
    id,
    displayName: "Fake AI Provider",
    capabilities: {
      supportsTools: true,
      supportsParallelTools: true,
      supportsStreaming: true,
      supportsStructuredOutput: false,
      supportsReasoning: false,
      supportsVision: false,
    },
    async generateResponse(request) {
      return toResponse(request);
    },
    async streamResponse(request): Promise<AiStreamResponse> {
      const res = toResponse(request);
      const stream = (async function* (): AsyncGenerator<AiStreamEvent> {
        if (res.message.content) {
          // Chunk for streaming UI tests
          const text = res.message.content;
          const mid = Math.max(1, Math.floor(text.length / 2));
          yield { type: "text_delta", text: text.slice(0, mid) };
          if (text.length > mid) yield { type: "text_delta", text: text.slice(mid) };
        }
        if (res.message.toolCalls?.length) {
          yield { type: "tool_calls_done", toolCalls: res.message.toolCalls };
        }
        yield {
          type: "message_done",
          message: res.message as Extract<AiMessage, { role: "assistant" }>,
          finishReason: res.finishReason,
        };
        yield { type: "usage", usage: res.usage };
      })();
      return { stream };
    },
  };
}

function lastUserContent(messages: AiMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

function hasToolResult(messages: AiMessage[]): boolean {
  return messages.some((m) => m.role === "tool");
}

/**
 * Message-aware Fake provider for local/E2E: Help answers as text;
 * operational questions first request a READ tool, then summarize.
 */
export function createConversationalFakeAiProvider(opts?: { id?: string }): AiProvider {
  const id = opts?.id ?? "fake";
  const baseCaps = {
    supportsTools: true,
    supportsParallelTools: true,
    supportsStreaming: true,
    supportsStructuredOutput: false,
    supportsReasoning: false,
    supportsVision: false,
  } as const;

  function decide(request: AiGenerateRequest): AiGenerateResponse {
    const q = lastUserContent(request.messages).toLowerCase();
    const afterTool = hasToolResult(request.messages);

    if (afterTool) {
      const toolNames = request.messages
        .filter((m): m is Extract<AiMessage, { role: "tool" }> => m.role === "tool")
        .map((m) => m.toolName)
        .join(" ");
      const text = /material/i.test(toolNames)
        ? "Según Bloqer (fake): revisá materiales en la obra. Abrí /proyectos para el detalle autorizado."
        : /purchase_order|pending/i.test(toolNames)
          ? "Según Bloqer (fake): hay OC pendientes de aprobación. Abrí el hub de compras del proyecto."
          : "Resumen (FakeAiProvider): usé solo tools de lectura. No inventé montos.";
      return {
        message: { role: "assistant", content: text },
        finishReason: "stop",
        usage: {
          provider: id,
          model: request.model,
          inputTokens: 20,
          outputTokens: text.length,
          cachedTokens: null,
          reasoningTokens: null,
        },
      };
    }

    if (/cómo creo|como creo|solicitud de compra|significa|ayuda|centro de ayuda/.test(q)) {
      const text =
        "Para crear una solicitud de compra (SC) en Bloqer: abrí el proyecto → Solicitudes de compra → Nueva. " +
        "Más detalle en el centro de ayuda: /ayuda. (respuesta FakeAiProvider)";
      return {
        message: { role: "assistant", content: text },
        finishReason: "stop",
        usage: {
          provider: id,
          model: request.model,
          inputTokens: 15,
          outputTokens: text.length,
          cachedTokens: null,
          reasoningTokens: null,
        },
      };
    }

    let toolName = "get_current_context";
    if (/oc|orden|pendient|compra/.test(q)) toolName = "get_pending_purchase_orders";
    else if (/material|faltan|faltante/.test(q)) toolName = "get_project_material_shortages";
    else if (/atrasad|cronograma|tarea/.test(q)) toolName = "get_delayed_schedule_items";
    else if (/pagar|debo|cxp|proveedor/.test(q)) toolName = "get_payables";
    else if (/cobrar|deben|cxc|cliente/.test(q)) toolName = "get_receivables";

    const toolCalls: AiToolCall[] = [
      {
        id: `call_fake_${toolName}`,
        name: toolName,
        argumentsJson: "{}",
      },
    ];
    return {
      message: { role: "assistant", content: null, toolCalls },
      finishReason: "tool_calls",
      usage: {
        provider: id,
        model: request.model,
        inputTokens: 12,
        outputTokens: 8,
        cachedTokens: null,
        reasoningTokens: null,
      },
    };
  }

  return {
    id,
    displayName: "Fake AI Provider (conversational)",
    capabilities: baseCaps,
    async generateResponse(request) {
      return decide(request);
    },
    async streamResponse(request): Promise<AiStreamResponse> {
      const res = decide(request);
      const stream = (async function* (): AsyncGenerator<AiStreamEvent> {
        if (res.message.content) {
          const text = res.message.content;
          const mid = Math.max(1, Math.floor(text.length / 3));
          yield { type: "text_delta", text: text.slice(0, mid) };
          yield { type: "text_delta", text: text.slice(mid, mid * 2) };
          yield { type: "text_delta", text: text.slice(mid * 2) };
        }
        if (res.message.toolCalls?.length) {
          yield { type: "tool_calls_done", toolCalls: res.message.toolCalls };
        }
        yield {
          type: "message_done",
          message: res.message as Extract<AiMessage, { role: "assistant" }>,
          finishReason: res.finishReason,
        };
        yield { type: "usage", usage: res.usage };
      })();
      return { stream };
    },
  };
}

/** Second registry id for abstraction spike (same Fake under another name). */
export function createFakeSecondaryProvider(): AiProvider {
  return createFakeAiProvider({ id: "fake_secondary", turns: [{ kind: "text", text: "Secondary provider OK" }] });
}
