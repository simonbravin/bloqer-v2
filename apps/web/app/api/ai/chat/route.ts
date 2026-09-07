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
  userFacingOpenAiErrorMessage,
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
  aiCanViewCompanyAp,
  aiCanViewCompanyAr,
  aiCanViewTreasury,
} from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import {
  AI_RATE_LIMIT_USER_MESSAGE,
  checkAiChatRateLimit,
} from "@/lib/ai-rate-limit";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { filterSafeAiLinks } from "@/features/bloqer-ai/lib/safe-ai-content";

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
  // Reserved for future entity-aware tools — ignored for auth until revalidated like projects.
  currentEntityType: z.string().max(80).optional(),
  currentEntityId: z.string().uuid().optional(),
  /** Client hint: no prior assistant messages in this browser session. */
  isFirstAssistantTurn: z.boolean().optional(),
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
    return userFacingOpenAiErrorMessage(err.code);
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("aborted") || msg.includes("timeout") || msg.includes("timed out")) {
      return userFacingOpenAiErrorMessage("TIMEOUT");
    }
  }
  return userFacingOpenAiErrorMessage("UNKNOWN");
}

function clientSafeStreamError(message: string, code?: string): string {
  if (code === "TIMEOUT") return userFacingOpenAiErrorMessage("TIMEOUT");
  if (code === "CANCELLED") return userFacingOpenAiErrorMessage("CANCELLED");
  if (code === "AUTH") return userFacingOpenAiErrorMessage("AUTH");
  if (code === "RATE_LIMIT") return userFacingOpenAiErrorMessage("RATE_LIMIT");
  if (code === "NOT_CONFIGURED") return userFacingOpenAiErrorMessage("NOT_CONFIGURED");
  if (code === "UNSUPPORTED") return userFacingOpenAiErrorMessage("UNSUPPORTED");
  if (code === "BAD_REQUEST") {
    // Only allow known orchestrator Spanish (tool/turn limits). Never vendor English.
    if (
      message &&
      /alcanzó el (límite|máximo)|máximo de pasos|límite de consultas|Consulta cancelada/i.test(message) &&
      !/reasoning_effort|chat\/completions|function tools|openai|api[_ ]?key|sk-/i.test(message)
    ) {
      return message;
    }
    return userFacingOpenAiErrorMessage("BAD_REQUEST");
  }
  // Anything else (including English vendor text) → generic.
  if (
    message &&
    /alcanzó el (límite|máximo)|máximo de pasos|límite de consultas|Consulta cancelada/i.test(message) &&
    !/reasoning_effort|chat\/completions|function tools|openai|api[_ ]?key|sk-/i.test(message)
  ) {
    return message;
  }
  return userFacingOpenAiErrorMessage("PROVIDER");
}

/** Strip injection-prone noise from client route hints (never authorization). */
function sanitizeCurrentRouteHint(route: string | undefined): string | undefined {
  if (!route) return undefined;
  const trimmed = route.trim().slice(0, 200);
  if (!trimmed.startsWith("/")) return undefined;
  if (trimmed.includes("://") || trimmed.startsWith("//")) return undefined;
  if (/[<>`\r\n\0]/.test(trimmed)) return undefined;
  // Path only — drop query/hash to reduce prompt injection surface.
  const pathOnly = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  if (!/^\/[A-Za-z0-9\-._/~]*$/.test(pathOnly)) return undefined;
  return pathOnly;
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

  // After auth + body validation so invalid payloads do not burn AI quota.
  const rate = checkAiChatRateLimit({
    tenantId: service.tenantId,
    userId: service.actorUserId,
  });
  if (!rate.ok) {
    return Response.json(
      { error: AI_RATE_LIMIT_USER_MESSAGE },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      },
    );
  }

  // Convenience context only — never authorization. Drop invalid/inaccessible project hints.
  let safeProjectId = body.currentProjectId;
  if (safeProjectId) {
    try {
      const { requireProjectAccess } = await import("@bloqer/services");
      await requireProjectAccess(safeProjectId, service);
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
    currentRoute: sanitizeCurrentRouteHint(body.currentRoute),
    currentProjectId: safeProjectId,
    // Entity hints ignored until ownership-validated tools exist.
    currentEntityType: undefined,
    currentEntityId: undefined,
    actorDisplayName: current.session.user.name ?? current.session.user.email ?? undefined,
    tenantName: current.tenantCtx.tenantName,
    enabledModules,
    isFirstAssistantTurn: body.isFirstAssistantTurn === true,
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

  // Deny-by-default advertise: only tools the session may use.
  const tools = registry.definitions({ risks: ["READ"], ctx: aiCtx, logAdvertise: false });
  const history = normalizeHistoryForProvider(body.messages);

  const hasCompanyFinanceAccess =
    aiCanViewTreasury(service.roles) ||
    aiCanViewCompanyAp(service.roles) ||
    aiCanViewCompanyAr(service.roles);

  const system = buildBloqerAiSystemPrompt({
    locale: aiCtx.locale,
    timezone: aiCtx.timezone,
    preferredName: aiCtx.actorPreferredName,
    isFirstAssistantTurn: aiCtx.isFirstAssistantTurn,
    hasCompanyFinanceAccess,
    contextSummary: [
      `Usuario (sesión): ${aiCtx.actorPreferredName ?? aiCtx.actorDisplayName ?? "—"}`,
      `Roles: ${(aiCtx.actorRoleLabels ?? []).join(", ") || "—"}`,
      `Empresa: ${aiCtx.tenantName ?? "—"}`,
      `Ruta: ${aiCtx.currentRoute ?? "—"}`,
      `Proyecto actual (hint validado al usarlo): ${aiCtx.currentProjectId ?? "ninguno"}`,
      `Acceso finanzas empresa: ${hasCompanyFinanceAccess ? "sí" : "no"}`,
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
          maxTurns: env.maxAgentTurns,
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
            const links = filterSafeAiLinks(ev.links);
            send("tool_end", {
              toolCallId: ev.toolCallId,
              name: ev.name,
              ok: ev.ok,
              ...(links.length ? { links } : {}),
            });
          } else if (ev.type === "presentation") {
            const safePresentation = {
              ...ev.presentation,
              insights: (ev.presentation.insights ?? []).map((insight) => ({
                ...insight,
                links: filterSafeAiLinks(insight.links ?? []),
              })),
              actions: (ev.presentation.actions ?? []).map((action) => ({
                ...action,
                links: filterSafeAiLinks(action.links ?? []),
              })),
            };
            send("presentation", { presentation: safePresentation });
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
