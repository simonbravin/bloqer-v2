import { z } from "zod";
import { listJobsiteLogsByProject } from "../../jobsite-log/jobsite-log.service";
import { getFieldHome } from "../../field/field-home.service";
import { getMyFieldPendingCounts } from "../../field/field-pending.service";
import { listCertificationsByProject } from "../../certification/certification.service";
import { resolveAiProjectId } from "../context";
import { defineBloqerAiTool, nowIso } from "../types";
import { ServiceError } from "../../types";

export const getRecentJobsiteLogsTool = defineBloqerAiTool({
  name: "get_recent_jobsite_logs",
  description: "Últimos partes de obra (libro de obra) del proyecto.",
  risk: "READ",
  requiredModules: ["JOBSITE_LOG"],
  inputSchema: z.object({
    projectId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(20).optional(),
    status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "CANCELLED"]).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", format: "uuid" },
      limit: { type: "integer", minimum: 1, maximum: 20 },
      status: { type: "string", enum: ["DRAFT", "SUBMITTED", "APPROVED", "CANCELLED"] },
    },
    additionalProperties: false,
  },
  statusLabel: "Consultando partes de obra…",
  async execute(ctx, args) {
    const projectId = await resolveAiProjectId(ctx, args.projectId);
    if (!projectId) throw new ServiceError("VALIDATION", "Indicá un proyecto o abrí una obra.");
    const limit = args.limit ?? 10;
    const logs = await listJobsiteLogsByProject(
      projectId,
      args.status ? { status: args.status } : undefined,
      ctx.service,
    );
    const rows = logs.slice(0, limit).map((l) => ({
      id: l.id,
      logDate:
        l.logDate instanceof Date ? l.logDate.toISOString().slice(0, 10) : String(l.logDate),
      status: l.status,
      weather: l.weather ?? null,
      href: `/proyectos/${projectId}/libro-obra/${l.id}`,
    }));
    const href = `/proyectos/${projectId}/libro-obra`;
    return {
      data: { total: logs.length, logs: rows },
      provenance: { sourceType: "bloqer_data", entityType: "Project", entityId: projectId, route: href, asOf: nowIso() },
      truncation: { total: logs.length, returned: rows.length },
      ui: { links: [{ label: "Ver libro de obra", href }], summaryLabel: "Consultando partes de obra…" },
    };
  },
});

export const getProjectFieldSummaryTool = defineBloqerAiTool({
  name: "get_project_field_summary",
  description: "Resumen Field: pendientes del actor y foco de obra (si aplica).",
  risk: "READ",
  inputSchema: z.object({ projectId: z.string().uuid().optional() }),
  jsonSchema: {
    type: "object",
    properties: { projectId: { type: "string", format: "uuid" } },
    additionalProperties: false,
  },
  statusLabel: "Consultando Field…",
  async execute(ctx, args) {
    const projectId = await resolveAiProjectId(ctx, args.projectId);
    const pending = await getMyFieldPendingCounts(ctx.service, projectId ? { projectId } : undefined);
    const home = await getFieldHome(ctx.service, { preferredProjectId: projectId, pendingCounts: pending });
    return {
      data: {
        pendingCounts: pending,
        featuredProject: home.featuredProject,
        todayItems: home.todayItems.slice(0, 10),
        actions: home.actions,
      },
      provenance: {
        sourceType: "bloqer_data",
        entityType: projectId ? "Project" : undefined,
        entityId: projectId ?? undefined,
        route: "/pendientes",
        asOf: nowIso(),
      },
      ui: { links: [{ label: "Ver pendientes", href: "/pendientes" }], summaryLabel: "Consultando Field…" },
    };
  },
});

export const getProjectCertificationSummaryTool = defineBloqerAiTool({
  name: "get_project_certification_summary",
  description: "Resumen liviano de certificaciones del proyecto (conteos por estado).",
  risk: "READ",
  requiredModules: ["CERTIFICATIONS"],
  inputSchema: z.object({ projectId: z.string().uuid().optional() }),
  jsonSchema: {
    type: "object",
    properties: { projectId: { type: "string", format: "uuid" } },
    additionalProperties: false,
  },
  statusLabel: "Consultando certificaciones…",
  async execute(ctx, args) {
    const projectId = await resolveAiProjectId(ctx, args.projectId);
    if (!projectId) throw new ServiceError("VALIDATION", "Indicá un proyecto o abrí una obra.");
    const certs = await listCertificationsByProject(projectId, ctx.service);
    const byStatus: Record<string, number> = {};
    for (const c of certs) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    }
    const recent = certs.slice(0, 8).map((c) => ({
      id: c.id,
      number: c.number,
      status: c.status,
      periodStart: c.periodStart instanceof Date ? c.periodStart.toISOString().slice(0, 10) : c.periodStart,
      periodEnd: c.periodEnd instanceof Date ? c.periodEnd.toISOString().slice(0, 10) : c.periodEnd,
      href: `/proyectos/${projectId}/certificaciones/${c.id}`,
    }));
    const href = `/proyectos/${projectId}/certificaciones`;
    return {
      data: { total: certs.length, byStatus, recent },
      provenance: { sourceType: "bloqer_data", entityType: "Project", entityId: projectId, route: href, asOf: nowIso() },
      ui: { links: [{ label: "Ver certificaciones", href }], summaryLabel: "Consultando certificaciones…" },
    };
  },
});
