import { searchHelpArticles } from "@/features/help/lib/search";
import { HELP_ARTICLES } from "@/features/help/lib/catalog";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  createAiProviderFromEnv,
  getBloqerAiEnv,
  ensureBundledKnowledgeLoaded,
  getLoadedKnowledgeIndex,
  isBloqerAiEnabled,
  loadKnowledgeIndex,
  runAgent,
  buildBloqerAiSystemPrompt,
  AiProviderError,
  type AiMessage,
  type KnowledgeIndex,
} from "@bloqer/ai";
import {
  OVERVIEW_MODULES,
  type PermissionModule,
} from "@bloqer/domain";
import {
  buildAiExecutionContext,
  createDefaultBloqerAiToolRegistry,
  getTenantModuleGate,
  requireProjectInTenant,
} from "@bloqer/services";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const bodySchema = z.object({
  messages: z.preprocess((raw) => {
    if (!Array.isArray(raw)) return raw;
    return raw
      .filter(
        (m): m is { role: unknown; content: unknown } =>
          !!m && typeof m === "object" && "content" in m && "role" in m,
      )
      .map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content.trim() : m.content,
      }))
      .filter((m) => typeof m.content === "string" && m.content.length > 0);
  }, z.array(chatMessageSchema).min(1).max(40)),
  currentRoute: z.string().max(500).optional(),
  currentProjectId: z.string().uuid().optional(),
  currentEntityType: z.string().max(80).optional(),
  currentEntityId: z.string().uuid().optional(),
});

function ensureKnowledgeLoaded() {
  // Prefer static JSON import (bundled into the route for Vercel NFT).
  if (ensureBundledKnowledgeLoaded()) return;
  if (getLoadedKnowledgeIndex()) return;
  const candidates = [
    path.join(process.cwd(), "packages/ai/knowledge/generated/docs-index.json"),
    path.join(process.cwd(), "../../packages/ai/knowledge/generated/docs-index.json"),
    path.join(process.cwd(), "node_modules/@bloqer/ai/knowledge/generated/docs-index.json"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      loadKnowledgeIndex(JSON.parse(readFileSync(p, "utf8")) as KnowledgeIndex);
      return;
    } catch {
      /* try next */
    }
  }
}

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Merge consecutive same-role turns so providers never see user/user or assistant/assistant. */
function normalizeHistoryForProvider(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): AiMessage[] {
  const out: AiMessage[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last?.role === "user" && m.role === "user") {
      last.content = `${last.content}\n\n${m.content}`;
      continue;
    }
    if (last?.role === "assistant" && m.role === "assistant") {
      const prev = last.content ?? "";
      last.content = prev ? `${prev}\n\n${m.content}` : m.content;
      continue;
    }
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else {
      out.push({ role: "assistant", content: m.content });
    }
  }
  return out;
}

function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const active = signals.filter(Boolean);
  if (active.length === 1) return active[0]!;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(active);
  }
  const ac = new AbortController();
  for (const s of active) {
    if (s.aborted) {
      ac.abort(s.reason);
      return ac.signal;
    }
    s.addEventListener("abort", () => ac.abort(s.reason), { once: true });
  }
  return ac.signal;
}

/** Never leak provider credential snippets or raw vendor payloads to the browser. */
function clientSafeAiErrorMessage(err: unknown): string {
  if (err instanceof AiProviderError) {
    switch (err.code) {
      case "AUTH":
        return "El proveedor de AI rechazó las credenciales. Revisá la configuración.";
      case "RATE_LIMIT":
        return "El proveedor de AI está saturado. Probá de nuevo en unos minutos.";
      case "NOT_CONFIGURED":
        return "Bloqer AI no está configurado correctamente.";
      case "TIMEOUT":
        return "La consulta tardó demasiado y se canceló.";
      case "UNSUPPORTED":
        return "El proveedor seleccionado no soporta esta operación.";
      case "BAD_REQUEST":
        return "No se pudo procesar la consulta. Reformulá la pregunta.";
      default:
        return "No se pudo completar la consulta al asistente.";
    }
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("aborted") || msg.includes("timeout") || msg.includes("timed out")) {
      return "La consulta se canceló o expiró.";
    }
  }
  return "No se pudo completar la consulta al asistente.";
}

function clientSafeStreamError(message: string, code?: string): string {
  if (code === "TIMEOUT") return "La consulta se canceló o expiró.";
  if (code === "AUTH") return "El proveedor de AI rechazó las credenciales. Revisá la configuración.";
  if (code === "RATE_LIMIT") return "El proveedor de AI está saturado. Probá de nuevo en unos minutos.";
  if (code === "NOT_CONFIGURED") return "Bloqer AI no está configurado correctamente.";
  if (code === "UNSUPPORTED") return "El proveedor seleccionado no soporta esta operación.";
  if (code === "BAD_REQUEST") {
    // Orchestrator messages (tool limits, max turns) are already Spanish and safe.
    if (message && !/api[_ ]?key|sk-|bearer|openai|anthropic|credential/i.test(message)) {
      return message;
    }
    return "No se pudo procesar la consulta. Reformulá la pregunta.";
  }
  if (message && !/api[_ ]?key|sk-|bearer|credential|authorization/i.test(message)) {
    // Allow short orchestrator Spanish messages; clamp anything vendor-looking.
    if (message.length <= 180 && !/[A-Za-z]{3,}\.[A-Za-z]{2,}/.test(message)) {
      return message;
    }
  }
  return "No se pudo completar la consulta al asistente.";
}

export async function POST(req: Request) {
  if (!isBloqerAiEnabled()) {
    return Response.json({ error: "Bloqer AI no está habilitado." }, { status: 503 });
  }

  const current = await getCurrentUser();
  if (!current?.tenantCtx || !current.session.user?.id) {
    return Response.json({ error: "No autenticado." }, { status: 401 });
  }

  const service = await buildTenantServiceContext();
  if (!service) {
    return Response.json({ error: "Sin contexto de tenant." }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Payload inválido." }, { status: 400 });
  }

  // Convenience context only — never authorization. Drop invalid/inaccessible project hints.
  let safeProjectId = body.currentProjectId;
  if (safeProjectId) {
    try {
      await requireProjectInTenant(safeProjectId, service.tenantId);
    } catch {
      safeProjectId = undefined;
    }
  }

  ensureKnowledgeLoaded();
  const env = getBloqerAiEnv();
  const gate = await getTenantModuleGate(service);
  const enabledModules = OVERVIEW_MODULES.filter((m) => gate.isEnabled(m)) as PermissionModule[];

  const aiCtx = buildAiExecutionContext({
    service,
    currentRoute: body.currentRoute,
    currentProjectId: safeProjectId,
    currentEntityType: body.currentEntityType,
    currentEntityId: body.currentEntityId,
    actorDisplayName: current.session.user.name ?? current.session.user.email ?? undefined,
    tenantName: current.tenantCtx.tenantName,
    enabledModules,
  });

  const registry = createDefaultBloqerAiToolRegistry({
    searchHelp: (query) =>
      searchHelpArticles(HELP_ARTICLES, { query })
        .slice(0, 6)
        .map((a) => ({
          slug: a.slug,
          title: a.title,
          summary: a.summary,
          href: `/ayuda/${a.slug}`,
        })),
  });

  const tools = registry.definitions({ risks: ["READ"] });
  const history = normalizeHistoryForProvider(body.messages);

  const system = buildBloqerAiSystemPrompt({
    locale: aiCtx.locale,
    timezone: aiCtx.timezone,
    contextSummary: [
      `Usuario: ${aiCtx.actorDisplayName ?? "—"}`,
      `Empresa: ${aiCtx.tenantName ?? "—"}`,
      `Roles: ${aiCtx.service.roles.join(", ")}`,
      `Ruta: ${aiCtx.currentRoute ?? "—"}`,
      `Proyecto actual (hint validado al usarlo): ${aiCtx.currentProjectId ?? "ninguno"}`,
      `Módulos habilitados: ${enabledModules.slice(0, 24).join(", ")}${enabledModules.length > 24 ? "…" : ""}`,
    ].join("\n"),
  });

  let provider;
  try {
    provider = createAiProviderFromEnv();
  } catch (err) {
    return Response.json({ error: clientSafeAiErrorMessage(err) }, { status: 503 });
  }

  const started = Date.now();
  const encoder = new TextEncoder();
  const agentSignal = combineAbortSignals(AbortSignal.timeout(env.timeoutMs), req.signal);

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed || req.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(sseEncode(event, data)));
        } catch {
          closed = true;
        }
      };
      try {
        const agent = runAgent({
          provider,
          model: env.model,
          system,
          messages: history,
          tools,
          maxTurns: 8,
          maxToolCalls: env.maxToolCalls,
          maxOutputTokens: env.maxOutputTokens,
          signal: agentSignal,
          stream: true,
          executeTool: async (call) => registry.execute(aiCtx, call, { risks: ["READ"] }),
        });

        for await (const ev of agent) {
          if (req.signal.aborted || closed) break;
          if (ev.type === "text_delta") send("text_delta", { text: ev.text });
          else if (ev.type === "tool_start") {
            send("tool_start", {
              toolCallId: ev.toolCallId,
              name: ev.name,
              label:
                ev.label ??
                registry.get(ev.name)?.statusLabel ??
                `Consultando ${ev.name}…`,
            });
          } else if (ev.type === "tool_end") {
            send("tool_end", { toolCallId: ev.toolCallId, name: ev.name, ok: ev.ok });
          } else if (ev.type === "usage") {
            // Privacy: metadata only — never log prompts, tool payloads, or API keys.
            console.info(
              JSON.stringify({
                type: "bloqer_ai_usage",
                correlationId: aiCtx.correlationId,
                tenantId: aiCtx.service.tenantId,
                actorUserId: aiCtx.service.actorUserId,
                provider: ev.usage.provider,
                model: ev.usage.model,
                inputTokens: ev.usage.inputTokens,
                outputTokens: ev.usage.outputTokens,
                cachedTokens: ev.usage.cachedTokens,
                reasoningTokens: ev.usage.reasoningTokens,
                toolCallCount: ev.usage.toolCallCount,
                latencyMs: ev.usage.latencyMs || Date.now() - started,
              }),
            );
            send("usage", {
              provider: ev.usage.provider,
              model: ev.usage.model,
              inputTokens: ev.usage.inputTokens,
              outputTokens: ev.usage.outputTokens,
              toolCallCount: ev.usage.toolCallCount,
              latencyMs: ev.usage.latencyMs,
            });
          } else if (ev.type === "error") {
            send("error", {
              message: clientSafeStreamError(ev.message, ev.code),
              code: ev.code,
            });
          } else if (ev.type === "done") {
            send("done", { assistantText: ev.assistantText });
          }
        }
      } catch (err) {
        send("error", { message: clientSafeAiErrorMessage(err) });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      // Client disconnected — AbortSignal on req propagates via agentSignal.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
