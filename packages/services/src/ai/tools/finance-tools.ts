import { z } from "zod";
import { getPayableAgingReport } from "../../aging/aging.service";
import { getReceivableAgingReport } from "../../aging/aging.service";
import { summarizePayablesByProject } from "../../ap/payable.service";
import { summarizeReceivablesByProject } from "../../ar/receivable.service";
import { getTreasuryHubOverview } from "../../treasury/treasury-hub.service";
import { canViewCompanyAp } from "../../ap/ap-access";
import { canViewCompanyAr } from "../../ar/ar-access";
import { resolveAiProjectId } from "../context";
import { defineBloqerAiTool, nowIso } from "../types";
import { AI_DATA_CLASS } from "../policy/data-class";
import { AI_DENY_MESSAGES } from "../policy/access";
import { minimizeAgingTopItem, minimizeCashPosition } from "../policy/minimize";
import { ServiceError } from "../../types";

function flattenAgingTop(
  report: Awaited<ReturnType<typeof getPayableAgingReport>>,
  limit: number,
) {
  const items = report.rows.flatMap((r) =>
    r.items.map((it) =>
      minimizeAgingTopItem({
        contactName: r.contactName,
        projectName: it.projectName,
        invoiceNumber: it.invoiceNumber,
        dueDate: it.dueDate,
        daysOverdue: it.daysOverdue,
        balanceDue: it.balanceDue,
        currency: it.currency,
        status: it.status,
      }),
    ),
  );
  items.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return items.slice(0, limit);
}

const payablesSchema = z.object({
  projectId: z.string().uuid().optional(),
  overdueOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(30).optional(),
});

export const getPayablesTool = defineBloqerAiTool({
  name: "get_payables",
  description:
    "Cuentas por pagar: resumen y top obligaciones (aging). Con projectId limita a la obra; sin proyecto usa vista empresa si el rol lo permite.",
  risk: "READ",
  requiredModules: ["AP"],
  policy: {
    dataClass: AI_DATA_CLASS.PROJECT_FINANCIAL,
    scope: "PROJECT",
    accessKind: "project_or_company_ap",
  },
  inputSchema: payablesSchema,
  jsonSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", format: "uuid" },
      overdueOnly: { type: "boolean" },
      limit: { type: "integer", minimum: 1, maximum: 30 },
    },
    additionalProperties: false,
  },
  statusLabel: "Consultando cuentas por pagar…",
  async execute(ctx, args) {
    const limit = args.limit ?? 15;
    const projectId = await resolveAiProjectId(ctx, args.projectId);
    if (projectId) {
      const summary = await summarizePayablesByProject(projectId, ctx.service);
      const aging = await getPayableAgingReport({ projectId }, ctx.service);
      let top = flattenAgingTop(aging, limit);
      if (args.overdueOnly) top = top.filter((i) => i.daysOverdue > 0);
      const href = `/proyectos/${projectId}/cuentas-por-pagar`;
      return {
        data: {
          scope: "project",
          summary: {
            totalByCurrency: summary.totalByCurrency,
            overdueByCurrency: summary.overdueByCurrency,
          },
          totals: {
            totalBalance: aging.totals.totalBalance,
            totalOverdue: aging.totals.totalOverdue,
            current: aging.totals.current,
          },
          top,
        },
        provenance: {
          sourceType: "bloqer_data",
          entityType: "Project",
          entityId: projectId,
          route: href,
          asOf: nowIso(),
        },
        truncation: {
          total: aging.rows.reduce((n, r) => n + r.items.length, 0),
          returned: top.length,
        },
        ui: {
          links: [{ label: "Ver CxP de obra", href }],
          summaryLabel: "Consultando cuentas por pagar…",
        },
      };
    }
    if (!canViewCompanyAp(ctx.service.roles)) {
      throw new ServiceError("FORBIDDEN", AI_DENY_MESSAGES.COMPANY_AP);
    }
    const aging = await getPayableAgingReport({}, ctx.service);
    let top = flattenAgingTop(aging, limit);
    if (args.overdueOnly) top = top.filter((i) => i.daysOverdue > 0);
    const href = "/finanzas/cuentas-por-pagar";
    return {
      data: {
        scope: "company",
        totals: {
          totalBalance: aging.totals.totalBalance,
          totalOverdue: aging.totals.totalOverdue,
          current: aging.totals.current,
        },
        top,
      },
      provenance: { sourceType: "bloqer_data", route: href, asOf: nowIso() },
      truncation: {
        total: aging.rows.reduce((n, r) => n + r.items.length, 0),
        returned: top.length,
      },
      ui: { links: [{ label: "Ver CxP", href }], summaryLabel: "Consultando cuentas por pagar…" },
    };
  },
});

const receivablesSchema = z.object({
  projectId: z.string().uuid().optional(),
  overdueOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(30).optional(),
});

export const getReceivablesTool = defineBloqerAiTool({
  name: "get_receivables",
  description: "Cuentas por cobrar: resumen y top (aging). Proyecto o empresa según contexto/permiso.",
  risk: "READ",
  requiredModules: ["AR"],
  policy: {
    dataClass: AI_DATA_CLASS.PROJECT_FINANCIAL,
    scope: "PROJECT",
    accessKind: "project_or_company_ar",
  },
  inputSchema: receivablesSchema,
  jsonSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", format: "uuid" },
      overdueOnly: { type: "boolean" },
      limit: { type: "integer", minimum: 1, maximum: 30 },
    },
    additionalProperties: false,
  },
  statusLabel: "Consultando cuentas por cobrar…",
  async execute(ctx, args) {
    const limit = args.limit ?? 15;
    const projectId = await resolveAiProjectId(ctx, args.projectId);
    if (projectId) {
      const summary = await summarizeReceivablesByProject(projectId, ctx.service);
      const aging = await getReceivableAgingReport({ projectId }, ctx.service);
      let top = flattenAgingTop(aging, limit);
      if (args.overdueOnly) top = top.filter((i) => i.daysOverdue > 0);
      const href = `/proyectos/${projectId}/cuentas-por-cobrar`;
      return {
        data: {
          scope: "project",
          summary: {
            totalByCurrency: summary.totalByCurrency,
            overdueByCurrency: summary.overdueByCurrency,
          },
          totals: {
            totalBalance: aging.totals.totalBalance,
            totalOverdue: aging.totals.totalOverdue,
            current: aging.totals.current,
          },
          top,
        },
        provenance: {
          sourceType: "bloqer_data",
          entityType: "Project",
          entityId: projectId,
          route: href,
          asOf: nowIso(),
        },
        truncation: {
          total: aging.rows.reduce((n, r) => n + r.items.length, 0),
          returned: top.length,
        },
        ui: {
          links: [{ label: "Ver CxC de obra", href }],
          summaryLabel: "Consultando cuentas por cobrar…",
        },
      };
    }
    if (!canViewCompanyAr(ctx.service.roles)) {
      throw new ServiceError("FORBIDDEN", AI_DENY_MESSAGES.COMPANY_AR);
    }
    const aging = await getReceivableAgingReport({}, ctx.service);
    let top = flattenAgingTop(aging, limit);
    if (args.overdueOnly) top = top.filter((i) => i.daysOverdue > 0);
    const href = "/finanzas/cuentas-por-cobrar";
    return {
      data: {
        scope: "company",
        totals: {
          totalBalance: aging.totals.totalBalance,
          totalOverdue: aging.totals.totalOverdue,
          current: aging.totals.current,
        },
        top,
      },
      provenance: { sourceType: "bloqer_data", route: href, asOf: nowIso() },
      truncation: {
        total: aging.rows.reduce((n, r) => n + r.items.length, 0),
        returned: top.length,
      },
      ui: { links: [{ label: "Ver CxC", href }], summaryLabel: "Consultando cuentas por cobrar…" },
    };
  },
});

export const getCashPositionTool = defineBloqerAiTool({
  name: "get_cash_position",
  description:
    "Posición de caja desde el hub de tesorería existente (saldos por moneda). No inventa proyecciones.",
  risk: "READ",
  requiredModules: ["TREASURY"],
  policy: {
    dataClass: AI_DATA_CLASS.TREASURY,
    scope: "COMPANY",
    accessKind: "treasury",
  },
  inputSchema: z.object({}).strict(),
  jsonSchema: { type: "object", properties: {}, additionalProperties: false },
  statusLabel: "Consultando tesorería…",
  async execute(ctx) {
    const hub = await getTreasuryHubOverview(ctx.service);
    const href = "/tesoreria";
    return {
      data: minimizeCashPosition(hub),
      provenance: { sourceType: "bloqer_data", route: href, asOf: nowIso() },
      ui: { links: [{ label: "Abrir tesorería", href }], summaryLabel: "Consultando tesorería…" },
    };
  },
});
