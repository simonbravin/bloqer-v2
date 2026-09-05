import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceError } from "../types";
import type { AiToolCall } from "@bloqer/ai";
import type { AiExecutionContext, AiToolRisk, BloqerAiTool } from "./types";
import { toAiToolDefinition, wrapToolDataAsModelContent } from "./types";

const DEFAULT_ALLOWED_RISKS: readonly AiToolRisk[] = ["READ"];

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

  list(opts?: { risks?: readonly AiToolRisk[] }): BloqerAiTool[] {
    const risks = new Set(opts?.risks ?? DEFAULT_ALLOWED_RISKS);
    return [...this.tools.values()].filter((t) => risks.has(t.risk));
  }

  definitions(opts?: { risks?: readonly AiToolRisk[] }) {
    return this.list(opts).map(toAiToolDefinition);
  }

  async execute(
    ctx: AiExecutionContext,
    call: AiToolCall,
    opts?: { risks?: readonly AiToolRisk[] },
  ): Promise<{ content: string; isError?: boolean; statusLabel?: string }> {
    const allowed = new Set(opts?.risks ?? DEFAULT_ALLOWED_RISKS);
    const tool = this.tools.get(call.name);
    if (!tool || !allowed.has(tool.risk)) {
      return {
        content: JSON.stringify({ error: `Herramienta no disponible: ${call.name}` }),
        isError: true,
      };
    }

    if (tool.requiredModules?.length) {
      const gate = await getTenantModuleGate(ctx.service);
      for (const mod of tool.requiredModules) {
        if (!gate.isEnabled(mod)) {
          return {
            content: JSON.stringify({
              error: `El módulo ${mod} está deshabilitado para este tenant.`,
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
      return {
        content: wrapToolDataAsModelContent(result),
        statusLabel: result.ui?.summaryLabel ?? tool.statusLabel,
      };
    } catch (err) {
      if (err instanceof ServiceError) {
        return {
          content: JSON.stringify({ error: err.message, code: err.code }),
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
