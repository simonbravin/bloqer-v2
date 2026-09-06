import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceError } from "../types";
import type { AiToolCall } from "@bloqer/ai";
import type { AiExecutionContext, AiToolRisk, BloqerAiTool } from "./types";
import { toAiToolDefinition, wrapToolDataAsModelContent } from "./types";
import {
  AI_DENY_MESSAGES,
  evaluateAiToolAccess,
  logAiToolAuthDecision,
} from "./policy/access";

const DEFAULT_ALLOWED_RISKS: readonly AiToolRisk[] = ["READ"];

export type RegistryListOptions = {
  risks?: readonly AiToolRisk[];
  /** When set, apply zero-trust advertise filter (deny by default per policy). */
  ctx?: AiExecutionContext;
  /** Log advertise decisions (defaults true when ctx is set). */
  logAdvertise?: boolean;
};

export class BloqerAiToolRegistry {
  private readonly tools = new Map<string, BloqerAiTool>();

  register(tool: BloqerAiTool<any>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate AI tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool as BloqerAiTool);
  }

  get(name: string): BloqerAiTool | undefined {
    return this.tools.get(name);
  }

  /** All registered tools (no policy filter) — tests / audit only. */
  all(): BloqerAiTool[] {
    return [...this.tools.values()];
  }

  isAdvertisable(tool: BloqerAiTool, ctx: AiExecutionContext): boolean {
    if (tool.policy.aiAllowed === false) return false;
    const decision = evaluateAiToolAccess(
      tool.policy.accessKind,
      ctx,
      tool.requiredModules,
    );
    return decision.allowed;
  }

  list(opts?: RegistryListOptions): BloqerAiTool[] {
    const risks = new Set(opts?.risks ?? DEFAULT_ALLOWED_RISKS);
    let tools = [...this.tools.values()].filter((t) => risks.has(t.risk));
    if (opts?.ctx) {
      tools = tools.filter((t) => {
        const ok = this.isAdvertisable(t, opts.ctx!);
        if (opts.logAdvertise !== false) {
          logAiToolAuthDecision({
            type: "bloqer_ai_tool_auth",
            correlationId: opts.ctx!.correlationId,
            tenantId: opts.ctx!.service.tenantId,
            userId: opts.ctx!.service.actorUserId,
            tool: t.name,
            decision: ok ? "allow" : "deny",
            phase: "advertise",
            dataClass: t.policy.dataClass,
            scope: t.policy.scope,
            reason: ok ? undefined : "policy_or_module",
          });
        }
        return ok;
      });
    }
    return tools;
  }

  definitions(opts?: RegistryListOptions) {
    return this.list(opts).map(toAiToolDefinition);
  }

  async execute(
    ctx: AiExecutionContext,
    call: AiToolCall,
    opts?: { risks?: readonly AiToolRisk[] },
  ): Promise<{
    content: string;
    isError?: boolean;
    statusLabel?: string;
    links?: { label: string; href: string }[];
  }> {
    const allowed = new Set(opts?.risks ?? DEFAULT_ALLOWED_RISKS);
    const tool = this.tools.get(call.name);

    if (!tool || !allowed.has(tool.risk)) {
      logAiToolAuthDecision({
        type: "bloqer_ai_tool_auth",
        correlationId: ctx.correlationId,
        tenantId: ctx.service.tenantId,
        userId: ctx.service.actorUserId,
        tool: call.name,
        decision: "deny",
        phase: "execute",
        reason: "unknown_or_risk",
      });
      return {
        content: JSON.stringify({
          error: AI_DENY_MESSAGES.UNKNOWN_TOOL,
          code: "FORBIDDEN",
        }),
        isError: true,
      };
    }

    // Secondary defense: even if the model somehow invokes a non-advertised tool.
    if (tool.policy.aiAllowed === false) {
      logAiToolAuthDecision({
        type: "bloqer_ai_tool_auth",
        correlationId: ctx.correlationId,
        tenantId: ctx.service.tenantId,
        userId: ctx.service.actorUserId,
        tool: tool.name,
        decision: "deny",
        phase: "execute",
        dataClass: tool.policy.dataClass,
        scope: tool.policy.scope,
        reason: "aiAllowed_false",
      });
      return {
        content: JSON.stringify({
          error: AI_DENY_MESSAGES.TOOL,
          code: "FORBIDDEN",
        }),
        isError: true,
        statusLabel: tool.statusLabel,
      };
    }

    const access = evaluateAiToolAccess(
      tool.policy.accessKind,
      ctx,
      tool.requiredModules,
    );
    if (!access.allowed) {
      logAiToolAuthDecision({
        type: "bloqer_ai_tool_auth",
        correlationId: ctx.correlationId,
        tenantId: ctx.service.tenantId,
        userId: ctx.service.actorUserId,
        tool: tool.name,
        decision: "deny",
        phase: "execute",
        dataClass: tool.policy.dataClass,
        scope: tool.policy.scope,
        reason: "access_kind",
      });
      return {
        content: JSON.stringify({
          error: access.denyMessage,
          code: "FORBIDDEN",
        }),
        isError: true,
        statusLabel: tool.statusLabel,
      };
    }

    // Module gate via live tenant settings (authoritative; complements enabledModules hint).
    if (tool.requiredModules?.length) {
      const gate = await getTenantModuleGate(ctx.service);
      for (const mod of tool.requiredModules) {
        if (!gate.isEnabled(mod)) {
          logAiToolAuthDecision({
            type: "bloqer_ai_tool_auth",
            correlationId: ctx.correlationId,
            tenantId: ctx.service.tenantId,
            userId: ctx.service.actorUserId,
            tool: tool.name,
            decision: "deny",
            phase: "execute",
            dataClass: tool.policy.dataClass,
            scope: tool.policy.scope,
            reason: `module_off:${mod}`,
          });
          return {
            content: JSON.stringify({
              error: AI_DENY_MESSAGES.MODULE,
              code: "FORBIDDEN",
            }),
            isError: true,
            statusLabel: tool.statusLabel,
          };
        }
      }
    }

    let args: unknown;
    try {
      args = tool.inputSchema.parse(JSON.parse(call.argumentsJson || "{}"));
    } catch {
      return {
        content: JSON.stringify({ error: "Argumentos inválidos para la herramienta." }),
        isError: true,
        statusLabel: tool.statusLabel,
      };
    }

    try {
      const result = await tool.execute(ctx, args);
      logAiToolAuthDecision({
        type: "bloqer_ai_tool_auth",
        correlationId: ctx.correlationId,
        tenantId: ctx.service.tenantId,
        userId: ctx.service.actorUserId,
        tool: tool.name,
        decision: "allow",
        phase: "execute",
        dataClass: tool.policy.dataClass,
        scope: tool.policy.scope,
      });
      return {
        content: wrapToolDataAsModelContent(result),
        statusLabel: result.ui?.summaryLabel ?? tool.statusLabel,
        ...(result.ui?.links?.length ? { links: result.ui.links } : {}),
      };
    } catch (err) {
      if (err instanceof ServiceError) {
        const safeMessage =
          err.code === "FORBIDDEN"
            ? access.denyMessage || AI_DENY_MESSAGES.TOOL
            : err.message;
        logAiToolAuthDecision({
          type: "bloqer_ai_tool_auth",
          correlationId: ctx.correlationId,
          tenantId: ctx.service.tenantId,
          userId: ctx.service.actorUserId,
          tool: tool.name,
          decision: "deny",
          phase: "execute",
          dataClass: tool.policy.dataClass,
          scope: tool.policy.scope,
          reason: `service:${err.code}`,
        });
        return {
          content: JSON.stringify({
            error: err.code === "FORBIDDEN" ? safeMessage : err.message,
            code: err.code,
          }),
          isError: true,
          statusLabel: tool.statusLabel,
        };
      }
      return {
        content: JSON.stringify({ error: "Error al consultar Bloqer." }),
        isError: true,
        statusLabel: tool.statusLabel,
      };
    }
  }
}
