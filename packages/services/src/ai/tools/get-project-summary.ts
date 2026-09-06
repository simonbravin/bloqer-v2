import { z } from "zod";
import { getProjectOverviewDashboard } from "../../project/project-overview-dashboard.service";
import { resolveAiProjectId } from "../context";
import { defineBloqerAiTool, nowIso } from "../types";
import { AI_DATA_CLASS } from "../policy/data-class";
import { ServiceError } from "../../types";

const inputSchema = z.object({
  projectId: z.string().uuid().optional(),
});

export const getProjectSummaryTool = defineBloqerAiTool({
  name: "get_project_summary",
  description:
    "Resumen operativo de una obra (KPIs, progreso de cronograma, alertas). Usa el proyecto del contexto si no se indica projectId.",
  risk: "READ",
  requiredModules: ["PROJECTS"],
  policy: {
    dataClass: AI_DATA_CLASS.PROJECT_FINANCIAL,
    scope: "PROJECT",
    accessKind: "project_financial",
  },
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", format: "uuid", description: "Opcional si hay proyecto en contexto" },
    },
    additionalProperties: false,
  },
  statusLabel: "Consultando resumen de obra…",
  async execute(ctx, args) {
    const projectId = await resolveAiProjectId(ctx, args.projectId);
    if (!projectId) {
      throw new ServiceError("VALIDATION", "Indicá un proyecto o abrí una obra en Bloqer.");
    }
    const dash = await getProjectOverviewDashboard(ctx.service, projectId);
    return {
      data: {
        project: {
          id: dash.project.id,
          name: dash.project.name,
          code: dash.project.code,
          status: dash.project.status,
        },
        scheduleProgress: dash.scheduleProgress,
        kpis: dash.kpis,
        alerts: dash.alerts.map((a) => ({
          title: a.label,
          severity: a.severity,
          ...(a.description ? { message: a.description } : {}),
        })),
        sectionsExcluded: dash.sectionsExcluded,
        href: `/proyectos/${projectId}`,
      },
      provenance: {
        sourceType: "bloqer_data",
        entityType: "Project",
        entityId: projectId,
        route: `/proyectos/${projectId}`,
        asOf: nowIso(),
      },
      ui: {
        summaryLabel: "Consultando resumen de obra…",
        links: [{ label: "Abrir obra", href: `/proyectos/${projectId}` }],
      },
    };
  },
});
