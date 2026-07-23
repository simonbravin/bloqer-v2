import { Prisma, prisma } from "@bloqer/database";
import type { PermissionModule } from "@bloqer/domain";
import { can } from "@bloqer/domain";
import type { DashboardKpi } from "../dashboard/tenant-dashboard.service";
import { pushMoneyRowsKpi } from "../dashboard/kpi-helpers";
import { listBudgetsByProject } from "../budget/budget.service";
import { summarizeProjectBillingVsCollections } from "../ar/project-ar-summary.service";
import { getProjectFinanceOverview } from "../project-finance/project-finance-overview.service";
import { getProjectById, getProjectShellInfo } from "./project.service";
import { canViewBudgetsArea } from "./project-nav-guards";
import {
  canViewProjectCashFlowReport,
  getProjectCashFlowReport,
} from "../project-cash-flow/project-cash-flow.service";
import { canViewProjectCostControlReport } from "../cost-control/cost-control.service";
import { getProjectProfitabilityKpi } from "../reports/project-profitability.service";
import { computeProjectScheduleProgressPct } from "../schedule/schedule-workspace.service";
import { canViewArProjectArea } from "../ar/ar-access";
import { canViewApProjectArea } from "../ap/ap-access";
import {
  canEditPurchaseOrders,
  canViewProcurementProjectArea,
  canViewPurchaseRequests,
} from "../procurement/procurement-access";
import { canViewSubcontractsArea } from "../subcontracts/subcontract-access";
import { assertJobsiteLogTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { ServiceContext } from "../types";

const ZERO = new Prisma.Decimal(0);

export type ProjectOverviewMoneyRow = { currency: string; amount: string };

export type ProjectOverviewBudgetKpi = {
  amountByCurrency: ProjectOverviewMoneyRow[];
  status: string | null;
  href: string;
};

export type ProjectOverviewReceivablesKpi = {
  openByCurrency: ProjectOverviewMoneyRow[];
  overdueByCurrency: ProjectOverviewMoneyRow[];
  href: string;
};

export type ProjectOverviewPayablesKpi = {
  openByCurrency: ProjectOverviewMoneyRow[];
  overdueByCurrency: ProjectOverviewMoneyRow[];
  href: string;
};

export type ProjectOverviewCashFlowKpi = {
  href: string;
  available: boolean;
};

export type ProjectOverviewCostControlKpi = {
  href: string;
  available: boolean;
};

export type ProjectOverviewProfitabilityKpi = {
  href: string;
  currency: string;
  grossMargin: string;
  grossMarginPct: string | null;
};

export type ProjectOverviewBillingVsCollections = {
  invoicedByCurrency: ProjectOverviewMoneyRow[];
  collectedByCurrency: ProjectOverviewMoneyRow[];
};

export type ProjectOverviewActivity = {
  certificationsCount: number | null;
  purchaseRequestsCount: number | null;
  purchaseRequestsAwaitingQuotesCount: number | null;
  purchaseOrdersCount: number | null;
  subcontractsCount: number | null;
  documentsCount: number | null;
  jobsiteLogsCount: number | null;
  stockMovementsCount: number | null;
};

export type ProjectOverviewAlert = {
  label: string;
  description: string;
  severity: "info" | "warning" | "critical";
  href?: string;
};

export type ProjectOverviewCashFlowMiniPoint = {
  label: string;
  inflows: string;
  outflows: string;
};

export type ProjectOverviewCashFlowMini = {
  currency: string;
  points: ProjectOverviewCashFlowMiniPoint[];
};

export type ProjectOverviewScheduleProgress = {
  /** Avance temporal entre inicio y fin estimado (0–100), o null si no se puede calcular. */
  percent: number | null;
  note: string | null;
};

export type ProjectOverviewSectionExcluded = {
  module: PermissionModule;
  section: string;
  reason: "TENANT_MODULE_DISABLED" | "MISSING_PERMISSION";
};

export type ProjectOverviewDashboard = {
  project: {
    id: string;
    name: string;
    code: string | null;
    status: string;
    clientName: string | null;
    startDate: string | null;
    estimatedEndDate: string | null;
  };
  compactKpis: DashboardKpi[];
  kpis: {
    budget: ProjectOverviewBudgetKpi | null;
    receivables: ProjectOverviewReceivablesKpi | null;
    payables: ProjectOverviewPayablesKpi | null;
    cashFlow: ProjectOverviewCashFlowKpi | null;
    costControl: ProjectOverviewCostControlKpi | null;
    profitability: ProjectOverviewProfitabilityKpi | null;
  };
  billingVsCollections: ProjectOverviewBillingVsCollections | null;
  /** Cobros y pagos imputados al proyecto por mes (primera moneda con datos). */
  cashFlowMini: ProjectOverviewCashFlowMini | null;
  scheduleProgress: ProjectOverviewScheduleProgress;
  activity: ProjectOverviewActivity;
  alerts: ProjectOverviewAlert[];
  sectionsExcluded: ProjectOverviewSectionExcluded[];
};

function fmtDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function computeScheduleProgress(startIso: string | null, endIso: string | null): ProjectOverviewScheduleProgress {
  if (!startIso) return { percent: null, note: "Sin fecha de inicio" };
  const start = new Date(`${startIso}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  if (today < s) return { percent: 0, note: null };
  if (!endIso) {
    return {
      percent: null,
      note: "Agregá la fecha de fin estimada para ver el avance temporal frente a hoy.",
    };
  }
  const end = new Date(`${endIso}T12:00:00`);
  end.setHours(0, 0, 0, 0);
  if (today >= end) return { percent: 100, note: null };
  const span = end.getTime() - s.getTime();
  if (span <= 0) return { percent: null, note: "La fecha de fin estimada es anterior al inicio." };
  const elapsed = today.getTime() - s.getTime();
  return { percent: Math.min(100, Math.max(0, Math.round((elapsed / span) * 100))), note: null };
}

function addMoneyMap(m: Map<string, Prisma.Decimal>, currency: string, amount: Prisma.Decimal) {
  m.set(currency, (m.get(currency) ?? ZERO).add(amount));
}

function mapMoneyMap(m: Map<string, Prisma.Decimal>): ProjectOverviewMoneyRow[] {
  return [...m.entries()]
    .filter(([, v]) => v.greaterThan(ZERO))
    .map(([currency, amount]) => ({ currency, amount: amount.toString() }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function canViewJobsiteLogArea(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "JOBSITE_LOG") || can(roles, "VIEW", "PROJECTS");
}

/**
 * Resumen ejecutivo del proyecto (Phase 15B). Un solo `getTenantModuleGate`; sin métricas inventadas.
 */
export async function getProjectOverviewDashboard(
  ctx: ServiceContext,
  projectId: string,
): Promise<ProjectOverviewDashboard> {
  const gate = await getTenantModuleGate(ctx);
  const shell = await getProjectShellInfo(projectId, ctx);
  const base = `/proyectos/${projectId}`;
  const sectionsExcluded: ProjectOverviewSectionExcluded[] = [];
  const alerts: ProjectOverviewAlert[] = [];

  let clientName: string | null = null;
  let startDate: string | null = null;
  let estimatedEndDate: string | null = null;
  if (can(ctx.roles, "VIEW", "PROJECTS")) {
    try {
      const full = await getProjectById(projectId, ctx);
      clientName = full.client ? (full.client.fantasyName ?? full.client.legalName) : null;
      startDate = fmtDate(full.startDate);
      estimatedEndDate = fmtDate(full.expectedEndDate);
    } catch {
      /* omit extended fields */
    }
  } else {
    sectionsExcluded.push({ module: "PROJECTS", section: "project_detail", reason: "MISSING_PERMISSION" });
  }

  const finance = await getProjectFinanceOverview(ctx, projectId, { gate });

  let budget: ProjectOverviewBudgetKpi | null = null;
  const budgetsGate = gate.isEnabled("BUDGETS") && gate.isEnabled("PROJECTS");
  if (!gate.isEnabled("BUDGETS")) {
    sectionsExcluded.push({ module: "BUDGETS", section: "budget", reason: "TENANT_MODULE_DISABLED" });
  } else if (!budgetsGate) {
    sectionsExcluded.push({ module: "BUDGETS", section: "budget", reason: "TENANT_MODULE_DISABLED" });
  } else if (!canViewBudgetsArea(ctx.roles)) {
    sectionsExcluded.push({ module: "BUDGETS", section: "budget", reason: "MISSING_PERMISSION" });
  } else {
    try {
      const budgets = await listBudgetsByProject(projectId, ctx);
      const approved = budgets.filter((b) => b.status === "APPROVED" || b.status === "CLOSED");
      const pick =
        approved.length === 0 ? null : approved.reduce((a, b) => (a.versionNumber >= b.versionNumber ? a : b));
      const amountByCurrency: ProjectOverviewMoneyRow[] = pick
        ? [{ currency: pick.currency, amount: pick.totalSalePrice.toString() }]
        : [];
      budget = {
        amountByCurrency,
        status: pick?.status ?? null,
        href: `${base}/presupuestos`,
      };
    } catch {
      sectionsExcluded.push({ module: "BUDGETS", section: "budget", reason: "MISSING_PERMISSION" });
    }
  }

  let receivables: ProjectOverviewReceivablesKpi | null = null;
  if (!gate.isEnabled("AR")) {
    sectionsExcluded.push({ module: "AR", section: "receivables", reason: "TENANT_MODULE_DISABLED" });
  } else if (!finance.sections.ar?.canView) {
    sectionsExcluded.push({ module: "AR", section: "receivables", reason: "MISSING_PERMISSION" });
  } else {
    const ar = finance.sections.ar;
    receivables = {
      openByCurrency: ar.totalReceivableByCurrency.map((r) => ({ currency: r.currency, amount: r.amount })),
      overdueByCurrency: ar.overdueByCurrency.map((r) => ({ currency: r.currency, amount: r.amount })),
      href: ar.links.receivables,
    };
    for (const row of ar.overdueByCurrency) {
      if (Number(row.amount) > 0) {
        alerts.push({
          label: "Cuentas por cobrar vencidas",
          description: `Hay saldo vencido en ${row.currency}.`,
          severity: "warning",
          href: ar.links.receivables,
        });
        break;
      }
    }
  }

  if (gate.isEnabled("SCHEDULE") && can(ctx.roles, "VIEW", "SCHEDULE")) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const delayedCount = await prisma.scheduleItem.count({
      where: {
        tenantId: ctx.tenantId,
        schedule: { projectId },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        endDate: { lt: today },
      },
    });
    if (delayedCount > 0) {
      alerts.push({
        label: "Tareas de cronograma atrasadas",
        description: `${delayedCount} ítem${delayedCount === 1 ? "" : "s"} con fecha de fin vencida.`,
        severity: "warning",
        href: `${base}/cronograma?delayedOnly=1`,
      });
    }
  }

  let payables: ProjectOverviewPayablesKpi | null = null;
  if (!gate.isEnabled("AP")) {
    sectionsExcluded.push({ module: "AP", section: "payables", reason: "TENANT_MODULE_DISABLED" });
  } else if (!finance.sections.ap?.canView) {
    sectionsExcluded.push({ module: "AP", section: "payables", reason: "MISSING_PERMISSION" });
  } else {
    const ap = finance.sections.ap;
    payables = {
      openByCurrency: ap.totalPayableByCurrency.map((r) => ({ currency: r.currency, amount: r.amount })),
      overdueByCurrency: ap.overdueByCurrency.map((r) => ({ currency: r.currency, amount: r.amount })),
      href: ap.links.payables,
    };
    for (const row of ap.overdueByCurrency) {
      if (Number(row.amount) > 0) {
        alerts.push({
          label: "Cuentas por pagar vencidas",
          description: `Hay saldo vencido en ${row.currency}.`,
          severity: "critical",
          href: ap.links.payables,
        });
        break;
      }
    }
  }

  let cashFlow: ProjectOverviewCashFlowKpi | null = null;
  const canCf = gate.isEnabled("PROJECTS") && canViewProjectCashFlowReport(ctx.roles);
  if (!gate.isEnabled("PROJECTS")) {
    sectionsExcluded.push({ module: "PROJECTS", section: "cash_flow", reason: "TENANT_MODULE_DISABLED" });
  } else if (!canViewProjectCashFlowReport(ctx.roles)) {
    sectionsExcluded.push({ module: "PROJECTS", section: "cash_flow", reason: "MISSING_PERMISSION" });
  } else {
    cashFlow = { href: `${base}/flujo-caja`, available: canCf };
  }

  let cashFlowMini: ProjectOverviewCashFlowMini | null = null;
  if (canCf) {
    try {
      const cf = await getProjectCashFlowReport(projectId, { period: "month" }, ctx);
      const row = cf.currencies.find((c) => c.currency === "ARS") ?? cf.currencies[0];
      if (row?.periods.length) {
        cashFlowMini = {
          currency: row.currency,
          points: row.periods.map((p) => ({
            label: p.periodLabel,
            inflows: p.inflows,
            outflows: p.outflows,
          })),
        };
      }
    } catch {
      /* omit mini chart */
    }
  }

  let costControl: ProjectOverviewCostControlKpi | null = null;
  const canCc =
    gate.isEnabled("PROJECTS") &&
    gate.isEnabled("BUDGETS") &&
    canViewProjectCostControlReport(ctx.roles);
  if (!gate.isEnabled("BUDGETS")) {
    sectionsExcluded.push({ module: "BUDGETS", section: "cost_control", reason: "TENANT_MODULE_DISABLED" });
  } else if (!gate.isEnabled("PROJECTS")) {
    sectionsExcluded.push({ module: "PROJECTS", section: "cost_control", reason: "TENANT_MODULE_DISABLED" });
  } else if (!canViewProjectCostControlReport(ctx.roles)) {
    sectionsExcluded.push({ module: "PROJECTS", section: "cost_control", reason: "MISSING_PERMISSION" });
  } else {
    costControl = { href: `${base}/control-costos`, available: canCc };
  }

  let billingVsCollections: ProjectOverviewBillingVsCollections | null = null;
  if (gate.isEnabled("AR") && canViewArProjectArea(ctx.roles)) {
    try {
      const summary = await summarizeProjectBillingVsCollections(projectId, ctx);
      billingVsCollections = {
        invoicedByCurrency: summary.invoicedByCurrency,
        collectedByCurrency: summary.collectedByCurrency,
      };
    } catch {
      billingVsCollections = null;
    }
  }

  let certificationsCount: number | null = null;
  if (gate.isEnabled("CERTIFICATIONS") && can(ctx.roles, "VIEW", "CERTIFICATIONS")) {
    try {
      certificationsCount = await prisma.certification.count({
        where: { tenantId: ctx.tenantId, projectId },
      });
    } catch {
      certificationsCount = null;
    }
  } else if (!gate.isEnabled("CERTIFICATIONS")) {
    sectionsExcluded.push({
      module: "CERTIFICATIONS",
      section: "activity_certifications",
      reason: "TENANT_MODULE_DISABLED",
    });
  } else {
    sectionsExcluded.push({
      module: "CERTIFICATIONS",
      section: "activity_certifications",
      reason: "MISSING_PERMISSION",
    });
  }

  let purchaseRequestsCount: number | null = null;
  let purchaseRequestsAwaitingQuotesCount: number | null = null;
  if (gate.isEnabled("PROCUREMENT") && canViewPurchaseRequests(ctx.roles)) {
    purchaseRequestsCount = await prisma.purchaseRequest.count({
      where: { tenantId: ctx.tenantId, projectId, status: { not: "CANCELLED" } },
    });
    purchaseRequestsAwaitingQuotesCount = await prisma.purchaseRequest.count({
      where: { tenantId: ctx.tenantId, projectId, status: "SUBMITTED" },
    });
    if (
      purchaseRequestsAwaitingQuotesCount > 0 &&
      canEditPurchaseOrders(ctx.roles)
    ) {
      alerts.push({
        label: "Solicitudes pendientes de cotización",
        description: `${purchaseRequestsAwaitingQuotesCount} solicitud${purchaseRequestsAwaitingQuotesCount === 1 ? "" : "es"} enviada${purchaseRequestsAwaitingQuotesCount === 1 ? "" : "s"} sin cotización completa.`,
        severity: "warning",
        href: `${base}/compras`,
      });
    }
  } else if (!gate.isEnabled("PROCUREMENT")) {
    sectionsExcluded.push({
      module: "PURCHASE_REQUESTS",
      section: "activity_pr",
      reason: "TENANT_MODULE_DISABLED",
    });
  } else {
    sectionsExcluded.push({
      module: "PURCHASE_REQUESTS",
      section: "activity_pr",
      reason: "MISSING_PERMISSION",
    });
  }

  let purchaseOrdersCount: number | null = null;
  if (gate.isEnabled("PROCUREMENT") && canViewProcurementProjectArea(ctx.roles)) {
    purchaseOrdersCount = await prisma.purchaseOrder.count({
      where: { tenantId: ctx.tenantId, projectId },
    });
  } else if (!gate.isEnabled("PROCUREMENT")) {
    sectionsExcluded.push({ module: "PROCUREMENT", section: "activity_po", reason: "TENANT_MODULE_DISABLED" });
  } else {
    sectionsExcluded.push({ module: "PROCUREMENT", section: "activity_po", reason: "MISSING_PERMISSION" });
  }

  let subcontractsCount: number | null = null;
  if (gate.isEnabled("SUBCONTRACTS") && canViewSubcontractsArea(ctx.roles)) {
    subcontractsCount = await prisma.subcontract.count({
      where: { tenantId: ctx.tenantId, projectId },
    });
  } else if (!gate.isEnabled("SUBCONTRACTS")) {
    sectionsExcluded.push({
      module: "SUBCONTRACTS",
      section: "activity_subcontracts",
      reason: "TENANT_MODULE_DISABLED",
    });
  } else {
    sectionsExcluded.push({
      module: "SUBCONTRACTS",
      section: "activity_subcontracts",
      reason: "MISSING_PERMISSION",
    });
  }

  let documentsCount: number | null = null;
  if (gate.isEnabled("PROJECTS") && can(ctx.roles, "VIEW", "PROJECTS")) {
    documentsCount = await prisma.documentAttachment.count({
      where: { tenantId: ctx.tenantId, projectId, status: "ACTIVE" },
    });
  } else {
    sectionsExcluded.push({ module: "PROJECTS", section: "activity_documents", reason: "MISSING_PERMISSION" });
  }

  let jobsiteLogsCount: number | null = null;
  if (gate.isEnabled("JOBSITE_LOG") && canViewJobsiteLogArea(ctx.roles)) {
    try {
      await assertJobsiteLogTenantModule(ctx);
      jobsiteLogsCount = await prisma.jobsiteLog.count({
        where: { tenantId: ctx.tenantId, projectId },
      });
    } catch {
      jobsiteLogsCount = null;
    }
  } else if (!gate.isEnabled("JOBSITE_LOG")) {
    sectionsExcluded.push({ module: "JOBSITE_LOG", section: "activity_jobsite", reason: "TENANT_MODULE_DISABLED" });
  } else {
    sectionsExcluded.push({ module: "JOBSITE_LOG", section: "activity_jobsite", reason: "MISSING_PERMISSION" });
  }

  let stockMovementsCount: number | null = null;
  if (gate.isEnabled("INVENTORY") && can(ctx.roles, "VIEW", "INVENTORY")) {
    stockMovementsCount = await prisma.stockMovement.count({
      where: { tenantId: ctx.tenantId, projectId },
    });
  } else if (!gate.isEnabled("INVENTORY")) {
    sectionsExcluded.push({ module: "INVENTORY", section: "activity_stock", reason: "TENANT_MODULE_DISABLED" });
  } else {
    sectionsExcluded.push({ module: "INVENTORY", section: "activity_stock", reason: "MISSING_PERMISSION" });
  }

  const activity: ProjectOverviewActivity = {
    certificationsCount,
    purchaseRequestsCount,
    purchaseRequestsAwaitingQuotesCount,
    purchaseOrdersCount,
    subcontractsCount,
    documentsCount,
    jobsiteLogsCount,
    stockMovementsCount,
  };

  let scheduleProgress = computeScheduleProgress(startDate, estimatedEndDate);
  if (gate.isEnabled("SCHEDULE")) {
    try {
      const pct = await computeProjectScheduleProgressPct(projectId, ctx);
      if (pct != null) {
        scheduleProgress = {
          percent: Math.round(Number(pct)),
          note: "Avance ponderado de tareas del cronograma (distinto del certificado).",
        };
      }
    } catch {
      // fallback: tiempo transcurrido del proyecto
    }
  }

  const compactKpis: DashboardKpi[] = [];

  if (scheduleProgress.percent !== null) {
    compactKpis.push({
      key:   "schedule_progress",
      label: "Avance de cronograma",
      value: `${scheduleProgress.percent}%`,
      tone:  scheduleProgress.percent >= 100 ? "warning" : "default",
      href:  gate.isEnabled("SCHEDULE") ? `${base}/cronograma` : undefined,
    });
  } else {
    compactKpis.push({
      key:   "schedule_progress",
      label: "Avance de cronograma",
      value: "—",
      tone:  "muted",
      href:  gate.isEnabled("SCHEDULE") ? `${base}/cronograma` : undefined,
    });
  }

  if (budget) {
    pushMoneyRowsKpi(compactKpis, "budget_sale", "Presupuesto (venta)", budget.amountByCurrency, budget.href);
  }

  if (receivables) {
    pushMoneyRowsKpi(compactKpis, "ar_open", "Cuentas por cobrar", receivables.openByCurrency, receivables.href);
    pushMoneyRowsKpi(compactKpis, "ar_overdue", "C×C vencidas", receivables.overdueByCurrency, receivables.href);
  }

  if (payables) {
    pushMoneyRowsKpi(compactKpis, "ap_open", "Cuentas por pagar", payables.openByCurrency, payables.href);
    pushMoneyRowsKpi(compactKpis, "ap_overdue", "C×P vencidas", payables.overdueByCurrency, payables.href);
  }

  if (cashFlow?.available) {
    compactKpis.push({
      key:   "cash_flow",
      label: "Flujo de caja",
      value: "Ver serie",
      href:  cashFlow.href,
    });
  }

  if (costControl?.available) {
    compactKpis.push({
      key:   "cost_control",
      label: "Control de costos",
      value: "Abrir",
      href:  costControl.href,
    });
  }

  let profitability: ProjectOverviewProfitabilityKpi | null = null;
  if (canCc) {
    const pk = await getProjectProfitabilityKpi(projectId, ctx);
    if (pk) {
      profitability = {
        href: pk.href,
        currency: pk.currency,
        grossMargin: pk.grossMargin,
        grossMarginPct: pk.grossMarginPct,
      };
      compactKpis.push({
        key: "gross_margin",
        label: "Margen bruto",
        value: pk.grossMarginPct != null ? `${pk.grossMarginPct}%` : "Ver",
        href: pk.href,
        tone:
          pk.grossMarginPct != null && parseFloat(pk.grossMarginPct) < 0
            ? "danger"
            : pk.grossMarginPct != null && parseFloat(pk.grossMarginPct) > 0
              ? "success"
              : "default",
      });
    }
  }

  return {
    project: {
      id: shell.id,
      name: shell.name,
      code: shell.code,
      status: shell.status,
      clientName,
      startDate,
      estimatedEndDate,
    },
    compactKpis,
    kpis: {
      budget,
      receivables,
      payables,
      cashFlow,
      costControl,
      profitability,
    },
    billingVsCollections,
    cashFlowMini,
    scheduleProgress,
    activity,
    alerts,
    sectionsExcluded,
  };
}
