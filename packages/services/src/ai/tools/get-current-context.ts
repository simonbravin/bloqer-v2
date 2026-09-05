import { z } from "zod";
import { getTenantModuleGate } from "../../tenant-modules/tenant-module.service";
import { defineBloqerAiTool, nowIso } from "../types";

const inputSchema = z.object({}).strict();

export const getCurrentContextTool = defineBloqerAiTool({
  name: "get_current_context",
  description:
    "Devuelve el contexto de sesión del usuario autenticado: tenant, roles, proyecto actual si hay, ruta y módulos habilitados. No expone secretos.",
  risk: "READ",
  inputSchema,
  jsonSchema: { type: "object", properties: {}, additionalProperties: false },
  statusLabel: "Consultando contexto…",
  async execute(ctx) {
    const gate = await getTenantModuleGate(ctx.service);
    const enabledModules = (ctx.enabledModules ?? []).filter((m) => gate.isEnabled(m));
    return {
      data: {
        actor: {
          displayName: ctx.actorDisplayName ?? null,
          roles: ctx.service.roles,
        },
        tenant: {
          name: ctx.tenantName ?? null,
          companyId: ctx.service.companyId,
        },
        locale: ctx.locale,
        timezone: ctx.timezone,
        currentRoute: ctx.currentRoute ?? null,
        currentProjectId: ctx.currentProjectId ?? null,
        currentEntityType: ctx.currentEntityType ?? null,
        currentEntityId: ctx.currentEntityId ?? null,
        enabledModules,
      },
      provenance: { sourceType: "bloqer_data", asOf: nowIso() },
      ui: { summaryLabel: "Consultando contexto…" },
    };
  },
});
