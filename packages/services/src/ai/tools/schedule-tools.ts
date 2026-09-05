import { z } from "zod";
import { getProjectScheduleWorkspace } from "../../schedule/schedule-workspace.service";
import { resolveAiProjectId } from "../context";
import { defineBloqerAiTool, nowIso } from "../types";
import { ServiceError } from "../../types";

const inputSchema = z.object({
  projectId: z.string().uuid().optional(),
});

export const getProjectScheduleSummaryTool = defineBloqerAiTool({
  name: "get_project_schedule_summary",
  description: "Resumen de cronograma: progreso, atrasadas, totales. Requiere módulo SCHEDULE.",
  risk: "READ",
  requiredModules: ["PROJECTS", "SCHEDULE"],
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: { projectId: { type: "string", format: "uuid" } },
    additionalProperties: false,
  },
  statusLabel: "Consultando cronograma…",
  async execute(ctx, args) {
    const projectId = await resolveAiProjectId(ctx, args.projectId);
    if (!projectId) throw new ServiceError("VALIDATION", "Indicá un proyecto o abrí una obra.");
    const ws = await getProjectScheduleWorkspace(projectId, {}, ctx.service);
    const href = `/proyectos/${projectId}/cronograma`;
    if (ws.type !== "WORKSPACE") {
      return {
        data: { type: ws.type, message: "Cronograma no disponible aún para esta obra." },
        provenance: { sourceType: "bloqer_data", entityType: "Project", entityId: projectId, route: href, asOf: nowIso() },
        ui: { links: [{ label: "Ver cronograma", href }], summaryLabel: "Consultando cronograma…" },
      };
    }
    return {
      data: {
        type: ws.type,
        summary: ws.summary,
        budgetId: ws.budgetId,
        href,
      },
      provenance: { sourceType: "bloqer_data", entityType: "Project", entityId: projectId, route: href, asOf: nowIso() },
      ui: { links: [{ label: "Ver cronograma", href }], summaryLabel: "Consultando cronograma…" },
    };
  },
});

const delayedInput = z.object({
  projectId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export const getDelayedScheduleItemsTool = defineBloqerAiTool({
  name: "get_delayed_schedule_items",
  description: "Lista tareas/ítems de cronograma atrasados (top N).",
  risk: "READ",
  requiredModules: ["PROJECTS", "SCHEDULE"],
  inputSchema: delayedInput,
  jsonSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", format: "uuid" },
      limit: { type: "integer", minimum: 1, maximum: 20 },
    },
    additionalProperties: false,
  },
  statusLabel: "Consultando tareas atrasadas…",
  async execute(ctx, args) {
    const projectId = await resolveAiProjectId(ctx, args.projectId);
    if (!projectId) throw new ServiceError("VALIDATION", "Indicá un proyecto o abrí una obra.");
    const limit = args.limit ?? 15;
    const ws = await getProjectScheduleWorkspace(projectId, { delayedOnly: true }, ctx.service);
    const href = `/proyectos/${projectId}/cronograma`;
    if (ws.type !== "WORKSPACE") {
      return {
        data: { type: ws.type, items: [], total: 0 },
        provenance: { sourceType: "bloqer_data", entityType: "Project", entityId: projectId, route: href, asOf: nowIso() },
        ui: { links: [{ label: "Ver cronograma", href }] },
      };
    }
    const items = ws.items.slice(0, limit).map((it) => ({
      id: it.id,
      name: it.name,
      status: it.status,
      type: it.type,
      endDate: it.endDate,
      daysLate: it.daysLate,
    }));
    return {
      data: { total: ws.items.length, items, summary: ws.summary },
      provenance: { sourceType: "bloqer_data", entityType: "Project", entityId: projectId, route: href, asOf: nowIso() },
      truncation: { total: ws.items.length, returned: items.length },
      ui: {
        summaryLabel: "Consultando tareas atrasadas…",
        links: [{ label: "Ver atrasadas", href }],
      },
    };
  },
});
