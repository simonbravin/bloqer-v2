import { Prisma, prisma } from "@bloqer/database";
import type { ProjectStatus } from "@bloqer/database";
import type { UserRole } from "@bloqer/domain";
import { can } from "@bloqer/domain";
import { compareDecimal } from "@bloqer/utils";
import { canViewApProjectArea } from "../ap/ap-access";
import { canViewArProjectArea } from "../ar/ar-access";
import { companyScopeFilter } from "../company-scope";
import { getProjectCostControl } from "../cost-control/cost-control.service";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { canViewSubcontractsArea } from "../subcontracts/subcontract-access";
import {
  assertTenantModuleEnabledWithGate,
  getTenantModuleGate,
} from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ServiceContext, ServiceError } from "../types";
import type { CostVarianceLayer } from "./budget-variance.service";
import { parseCostVarianceLayer } from "./budget-variance.service";
import { resolveApprovedBudgetForProject } from "./report-budget-resolve";
import {
  parseCurrencyView,
  type CurrencyView,
  type ProfitabilityCurrencySlice,
} from "./report-currency-view";
import { getProjectOverheadAmount } from "../finance/project-overhead.service";
import { isPositiveMoneyDecimal } from "../finance/money-decimal";
import {
  projectRowIdWhereForScope,
  requireProjectAccess,
  resolveAccessibleProjectScope,
} from "../security/access";

export type ProfitabilityFilters = {
  budgetId?: string;
  costLayer?: CostVarianceLayer;
  revenueBasis?: "certified" | "invoiced";
  currencyView?: CurrencyView;
};

export type ProjectProfitabilityReport = {
  type: "REPORT";
  projectId: string;
  budgetId: string;
  budgetName: string;
  costLayer: CostVarianceLayer;
  revenueBasis: "certified" | "invoiced";
  currencyView: CurrencyView;
  currency: string;
  budgetCurrency: string;
  consolidationBlocked: boolean;
  byCurrency: ProfitabilityCurrencySlice[];
  revenue: string | null;
  directCost: string | null;
  grossMargin: string | null;
  grossMarginPct: string | null;
  projectedMargin: string;
  budgetTotalSale: string;
  netMarginAvailable: boolean;
  netMargin: string | null;
  overheadAmount: string | null;
  overheadManualAmount: string | null;
  overheadCalculatedAmount: string | null;
  overheadCompanyPct: string | null;
  netMarginNote: string;
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

export type ProjectProfitabilityEmpty = { type: "NO_APPROVED_BUDGETS" };

export type ProjectProfitabilityResult = ProjectProfitabilityReport | ProjectProfitabilityEmpty;

/** Net margin (R-004 / GG) — OWNER|ADMIN by default [D-013]. */
function canViewNetMargin(roles: UserRole[]): boolean {
  return roles.includes("OWNER") || roles.includes("ADMIN");
}

/** Gross margin (R-003) is a separate ceiling from access to operational cost control. */
export function canViewProjectProfitabilityReport(roles: UserRole[]): boolean {
  return roles.some((role) => role === "OWNER" || role === "ADMIN" || role === "FINANCE" || role === "PROJECT_MANAGER");
}

function getDirectCost(
  totals: {
    expectedCostExposure: string;
    committedCost: string;
    accruedCost: string;
    paidCost: string;
  },
  layer: CostVarianceLayer,
): string {
  switch (layer) {
    case "committed":
      return totals.committedCost;
    case "accrued":
      return totals.accruedCost;
    case "paid":
      return totals.paidCost;
    default:
      return totals.expectedCostExposure;
  }
}

const LAYER_LABELS: Record<CostVarianceLayer, string> = {
  exposure: "Exposición esperada",
  committed: "Comprometido",
  accrued: "Devengado",
  paid: "Pagado (caja)",
};

const LAYER_SOURCES = {
  exposure: ["PROCUREMENT", "SUBCONTRACTS", "AP"],
  committed: ["PROCUREMENT", "SUBCONTRACTS"],
  accrued: ["SUBCONTRACTS", "AP"],
  paid: ["AP"],
} as const satisfies Record<CostVarianceLayer, readonly string[]>;

export async function getProjectProfitabilityReport(
  projectId: string,
  filters: ProfitabilityFilters,
  ctx: ServiceContext,
): Promise<ProjectProfitabilityResult> {
  if (!canViewProjectProfitabilityReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver rentabilidad del proyecto");
  }

  const project = await requireProjectAccess(projectId, ctx);

  const costLayer = parseCostVarianceLayer(filters.costLayer);
  const revenueBasis = filters.revenueBasis === "invoiced" ? "invoiced" : "certified";
  const currencyView = parseCurrencyView(filters.currencyView);

  const budget = await resolveApprovedBudgetForProject(projectId, filters.budgetId, ctx);
  if (!budget) {
    if (filters.budgetId) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado o no está aprobado/cerrado");
    return { type: "NO_APPROVED_BUDGETS" };
  }
  const companyId = project.companyId ?? ctx.companyId ?? budget.companyId;
  const scopeCtx = { ...ctx, companyId };
  const cc = await getProjectCostControl(projectId, { budgetId: budget.id }, scopeCtx);
  if (cc.type === "NO_APPROVED_BUDGETS") return { type: "NO_APPROVED_BUDGETS" };
  if (cc.type === "BUDGET_SELECTION_REQUIRED") {
    throw new ServiceError("CONFLICT", "Seleccioná un presupuesto aprobado");
  }

  const budgetCurrency = cc.currency;

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "BUDGETS");
  const warnings: string[] = [
    `Margen bruto: ingresos (${revenueBasis === "certified" ? "certificado aprobado" : "facturado neto"}) − costos directos (${LAYER_LABELS[costLayer]}). Costos en moneda del presupuesto (${budgetCurrency}).`,
  ];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];
  warnings.push(...cc.warnings);

  const costPermissions = {
    AP: canViewApProjectArea(ctx.roles),
    PROCUREMENT: canViewProcurementProjectArea(ctx.roles),
    SUBCONTRACTS: canViewSubcontractsArea(ctx.roles),
  };
  for (const module of LAYER_SOURCES[costLayer]) {
    if (!gate.isEnabled(module) || !costPermissions[module]) {
      sectionsExcluded.push({ module, section: "direct_cost", reason: gate.isEnabled(module) ? "MISSING_PERMISSION" : "TENANT_MODULE_DISABLED" });
    }
  }
  const directCost = sectionsExcluded.length === 0 ? new Prisma.Decimal(getDirectCost(cc.totals, costLayer)) : null;
  if (directCost === null) warnings.push(`El costo ${LAYER_LABELS[costLayer].toLowerCase()} y el margen quedan sin calcular porque falta una fuente.`);
  const directCostAccrued = new Prisma.Decimal(cc.totals.accruedCost);
  const byCurrency: ProfitabilityCurrencySlice[] = [];
  let revenue: Prisma.Decimal | null = null;
  let incompatibleRevenue = false;

  if (revenueBasis === "certified") {
    if (gate.isEnabled("CERTIFICATIONS") && can(ctx.roles, "VIEW", "CERTIFICATIONS")) {
      revenue = new Prisma.Decimal(cc.totals.certifiedApproved);
    } else {
      sectionsExcluded.push({
        module: "CERTIFICATIONS",
        section: "certified_revenue",
        reason: gate.isEnabled("CERTIFICATIONS") ? "MISSING_PERMISSION" : "TENANT_MODULE_DISABLED",
      });
      warnings.push("La fuente de ingresos certificados no está disponible.");
    }
  } else if (!gate.isEnabled("AR") || !canViewArProjectArea(ctx.roles)) {
    sectionsExcluded.push({
      module: "AR",
      section: "invoiced_revenue",
      reason: gate.isEnabled("AR") ? "MISSING_PERMISSION" : "TENANT_MODULE_DISABLED",
    });
    warnings.push("La fuente de ingresos facturados no está disponible.");
  } else {
    warnings.push(
      "Facturado neto: subtotal sin IVA ni percepciones, más notas de débito y menos notas de crédito de la factura certificada. Las ventas directas quedan fuera de este presupuesto.",
    );
    const scope = {
      tenantId: ctx.tenantId,
      projectId,
      ...(companyId ? { companyId } : {}), // SalesInvoice.companyId NOT NULL
      status: "ISSUED" as const,
    };
    const invoices = await prisma.salesInvoice.findMany({
      where: {
        ...scope,
        documentKind: "INVOICE",
        certification: {
          tenantId: ctx.tenantId,
          projectId,
          budgetId: cc.budgetId,
          ...companyScopeFilter(scopeCtx),
        },
      },
      select: {
        subtotal: true,
        currency: true,
        companyId: true,
        clientContactId: true,
        certification: { select: { companyId: true } },
        creditDebitNotes: {
          where: { ...scope, documentKind: { in: ["CREDIT_NOTE", "DEBIT_NOTE"] } },
          select: { subtotal: true, currency: true, documentKind: true, companyId: true, clientContactId: true },
        },
      },
    });
    const zero = new Prisma.Decimal(0);
    const byCur = new Map<string, Prisma.Decimal>();
    let inconsistentLink = false;
    for (const invoice of invoices) {
      if (!invoice.certification || (invoice.certification.companyId !== null && invoice.certification.companyId !== invoice.companyId)) {
        inconsistentLink = true;
        continue;
      }
      let net = invoice.subtotal;
      for (const adjustment of invoice.creditDebitNotes) {
        if (adjustment.companyId !== invoice.companyId || adjustment.clientContactId !== invoice.clientContactId || adjustment.currency !== invoice.currency) {
          inconsistentLink = true;
          continue;
        }
        net = adjustment.documentKind === "CREDIT_NOTE"
          ? net.minus(adjustment.subtotal)
          : net.plus(adjustment.subtotal);
      }
      byCur.set(invoice.currency, (byCur.get(invoice.currency) ?? zero).plus(net));
    }
    revenue = byCur.get(budgetCurrency) ?? zero;
    for (const [currency, amount] of byCur) {
      if (currency === budgetCurrency) continue;
      byCurrency.push({
        currency,
        revenue: amount.toFixed(2),
        directCost: null,
        grossMargin: null,
        grossMarginPct: null,
      });
    }
    incompatibleRevenue = byCurrency.length > 0 || inconsistentLink;
    if (byCurrency.length > 0) {
      warnings.push("Hay ingresos facturados en otra moneda que el costo del presupuesto. Los importes se muestran separados y el margen no es comparable.");
    }
    if (inconsistentLink) {
      warnings.push("Hay comprobantes vinculados con datos inconsistentes. El margen no es calculable.");
    }
  }

  const consolidationBlocked = currencyView === "ARS" && (budgetCurrency !== "ARS" || incompatibleRevenue);
  if (consolidationBlocked) {
    warnings.push(
      "Vista ARS no disponible sin una base comparable en pesos. Se conservan los importes en sus monedas originales.",
    );
  }

  const grossMargin = revenue !== null && directCost !== null && !incompatibleRevenue ? revenue.minus(directCost) : null;
  const grossMarginPct = grossMargin !== null && revenue !== null && !revenue.isZero()
    ? grossMargin.div(revenue).times(100).toFixed(2)
    : null;
  const displayCurrency = budgetCurrency;
  if (revenue !== null) {
    byCurrency.unshift({
      currency: budgetCurrency,
      revenue: revenue.toFixed(2),
      directCost: directCost?.toFixed(2) ?? null,
      grossMargin: grossMargin?.toFixed(2) ?? null,
      grossMarginPct,
    });
  }

  const netAvailable = canViewNetMargin(ctx.roles);
  let netMargin: string | null = null;
  let overheadAmount: string | null = null;
  let overheadManualAmount: string | null = null;
  let overheadCalculatedAmount: string | null = null;
  let overheadCompanyPct: string | null = null;
  const netMarginNote = netAvailable
    ? "Margen neto = margen bruto − GG imputados a la obra [D-040]. Los GG de empresa no entran en EDT y costos."
    : "Margen neto (y GG imputados) visible solo para OWNER o ADMIN [D-013].";

  let netMarginAvailableFlag = false;
  if (netAvailable && project.companyId && LAYER_SOURCES.accrued.every((module) => gate.isEnabled(module) && costPermissions[module])) {
    const oh = await getProjectOverheadAmount(
      projectId,
      project.companyId,
      directCostAccrued,
      ctx,
      displayCurrency,
    );
    overheadAmount = oh.totalOverhead;
    if (oh.allocationMode === "AUTO_WEIGHT") {
      overheadCalculatedAmount = oh.autoWeightAmount;
      overheadCompanyPct = oh.autoWeightPct;
      if (oh.autoWeightAmount !== null && isPositiveMoneyDecimal(oh.autoWeightAmount)) {
        warnings.push(
          `GG prorrateados por peso del CD (suma de períodos con facturas corporativas, ARS): ${oh.autoWeightAmount} ARS.`,
        );
      }
      for (const w of oh.autoWeightWarnings) {
        if (!warnings.includes(w)) warnings.push(w);
      }
      if (displayCurrency !== "ARS") {
        warnings.push(
          `Margen neto con GG automático solo en ARS; la vista está en ${displayCurrency}.`,
        );
      }
    } else {
      overheadManualAmount = oh.manualTotal;
      overheadCalculatedAmount = oh.calculatedAmount;
      overheadCompanyPct = oh.calculatedPct;
      if (isPositiveMoneyDecimal(oh.manualTotal)) {
        warnings.push(
          "GG manual: suma de imputaciones por período cargadas a la obra (según filtro de período, o histórico si no hay filtro).",
        );
      }
      if (compareDecimal(oh.calculatedPct, "0") > 0) {
        warnings.push(
          `GG % empresa (${oh.calculatedPct}% sobre CD devengado): ${oh.calculatedAmount} ${oh.currency}.`,
        );
      }
    }
    const overheadCurrency = oh.allocationMode === "AUTO_WEIGHT" ? "ARS" : oh.currency;
    if (overheadCurrency === displayCurrency && grossMargin !== null && oh.totalOverhead !== null) {
      netMargin = grossMargin.minus(oh.totalOverhead).toFixed(2);
      netMarginAvailableFlag = true;
    } else if (overheadCurrency !== displayCurrency) {
      warnings.push(
        `Margen neto omitido: GG en ${overheadCurrency} no coincide con la moneda mostrada (${displayCurrency}).`,
      );
    }
    if (oh.allocationMode === "MANUAL" && oh.manualRowsExcluded > 0) {
      warnings.push(
        "Hay imputaciones manuales de GG en otra moneda; solo se suman las de la moneda del reporte.",
      );
    }
  }

  return {
    type: "REPORT",
    projectId,
    budgetId: cc.budgetId,
    budgetName: cc.budgetName,
    costLayer,
    revenueBasis,
    currencyView,
    currency: displayCurrency,
    budgetCurrency,
    consolidationBlocked,
    byCurrency,
    revenue: revenue?.toFixed(2) ?? null,
    directCost: directCost?.toFixed(2) ?? null,
    grossMargin: grossMargin?.toFixed(2) ?? null,
    grossMarginPct,
    projectedMargin: cc.totals.projectedMargin,
    budgetTotalSale: cc.totals.budgetTotalSale,
    netMarginAvailable: netMarginAvailableFlag,
    netMargin,
    overheadAmount,
    overheadManualAmount,
    overheadCalculatedAmount,
    overheadCompanyPct,
    netMarginNote,
    warnings,
    sectionsExcluded,
  };
}

// ─── Multi-project portfolio profitability ──────────────────────────────────

export type PortfolioProfitabilityFilters = {
  costLayer?: CostVarianceLayer;
  revenueBasis?: "certified" | "invoiced";
  status?: ProjectStatus;
};

export type PortfolioProfitabilityRow = {
  projectId: string;
  code: string;
  name: string;
  status: string;
  currency: string | null;
  revenue: string | null;
  directCost: string | null;
  grossMargin: string | null;
  grossMarginPct: string | null;
  warning: string | null;
};

export type PortfolioProfitabilityReport = {
  rows: PortfolioProfitabilityRow[];
  consolidatedRevenue: string | null;
  consolidatedDirectCost: string | null;
  consolidatedGrossMargin: string | null;
  consolidatedGrossMarginPct: string | null;
  /** Present when rows mix currencies — consolidated totals only sum the primary currency. */
  consolidatedCurrency: string | null;
  warnings: string[];
};

export async function getPortfolioProfitabilityReport(
  ctx: ServiceContext,
  filters?: PortfolioProfitabilityFilters,
): Promise<PortfolioProfitabilityReport> {
  if (!canViewProjectProfitabilityReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver rentabilidad multi-obra");
  }

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("PROJECTS") || !gate.isEnabled("BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Módulos de proyectos/presupuestos deshabilitados");
  }

  const statusFilter: Prisma.ProjectWhereInput = filters?.status
    ? { status: filters.status }
    : { status: { not: "CANCELLED" } };

  const scope = await resolveAccessibleProjectScope(ctx);
  const projects = await prisma.project.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...statusFilter,
      ...projectRowIdWhereForScope(scope),
    },
    select: { id: true, code: true, name: true, status: true },
    orderBy: { code: "asc" },
  });

  const settled = await Promise.allSettled(
    projects.map(async (project) => {
      const report = await getProjectProfitabilityReport(
        project.id,
        {
          costLayer: filters?.costLayer,
          revenueBasis: filters?.revenueBasis,
        },
        ctx,
      );
      return { project, report };
    }),
  );

  const rows: PortfolioProfitabilityRow[] = [];
  const warnings: string[] = [];
  const byCurrency = new Map<string, { revenue: Prisma.Decimal; directCost: Prisma.Decimal }>();

  for (let i = 0; i < settled.length; i++) {
    const project = projects[i]!;
    const outcome = settled[i]!;
    if (outcome.status === "rejected") {
      warnings.push(`Error al obtener rentabilidad de ${project.code ?? project.name}`);
      rows.push({
        projectId: project.id,
        code: project.code ?? "",
        name: project.name,
        status: project.status,
        currency: null,
        revenue: null,
        directCost: null,
        grossMargin: null,
        grossMarginPct: null,
        warning: "Error al obtener datos",
      });
      continue;
    }
    const { report } = outcome.value;
    if (report.type === "NO_APPROVED_BUDGETS") {
      rows.push({
        projectId: project.id,
        code: project.code ?? "",
        name: project.name,
        status: project.status,
        currency: null,
        revenue: null,
        directCost: null,
        grossMargin: null,
        grossMarginPct: null,
        warning: "Sin presupuesto aprobado",
      });
      continue;
    }
    if (report.revenue !== null && report.directCost !== null && report.grossMargin !== null) {
      const bucket = byCurrency.get(report.currency) ?? {
        revenue: new Prisma.Decimal(0),
        directCost: new Prisma.Decimal(0),
      };
      bucket.revenue = bucket.revenue.plus(report.revenue);
      bucket.directCost = bucket.directCost.plus(report.directCost);
      byCurrency.set(report.currency, bucket);
    }
    rows.push({
      projectId: project.id,
      code: project.code ?? "",
      name: project.name,
      status: project.status,
      currency: report.currency,
      revenue: report.revenue,
      directCost: report.directCost,
      grossMargin: report.grossMargin,
      grossMarginPct: report.grossMarginPct,
      warning: report.grossMargin === null ? "Margen no calculable; obra fuera del consolidado" : null,
    });
  }

  // Consolidate preferring tenant base currency; never sum ARS+USD.
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { baseCurrency: true },
  });
  const preferred = tenant?.baseCurrency ?? "ARS";

  let primaryCurrency: string | null = null;
  let primaryRev = new Prisma.Decimal(0);
  let primaryDc = new Prisma.Decimal(0);

  if (byCurrency.has(preferred)) {
    primaryCurrency = preferred;
    primaryRev = byCurrency.get(preferred)!.revenue;
    primaryDc = byCurrency.get(preferred)!.directCost;
  } else if (byCurrency.size > 0) {
    primaryCurrency = [...byCurrency.keys()].sort()[0]!;
    primaryRev = byCurrency.get(primaryCurrency)!.revenue;
    primaryDc = byCurrency.get(primaryCurrency)!.directCost;
  }
  if (byCurrency.size > 1) {
    warnings.push(
      `Hay proyectos en ${[...byCurrency.keys()].join(", ")}. El consolidado suma solo ${primaryCurrency}.`,
    );
  }

  const consolidatedGrossMargin = primaryRev.minus(primaryDc);
  return {
    rows,
    consolidatedRevenue: primaryCurrency === null ? null : primaryRev.toFixed(2),
    consolidatedDirectCost: primaryCurrency === null ? null : primaryDc.toFixed(2),
    consolidatedGrossMargin: primaryCurrency === null ? null : consolidatedGrossMargin.toFixed(2),
    consolidatedGrossMarginPct: primaryRev.isZero()
      ? null
      : consolidatedGrossMargin.div(primaryRev).times(100).toFixed(2),
    consolidatedCurrency: primaryCurrency,
    warnings,
  };
}

/** KPI compacto para dashboard de proyecto (primera moneda con datos). */
export async function getProjectProfitabilityKpi(
  projectId: string,
  ctx: ServiceContext,
  budgetId?: string,
): Promise<{
  currency: string;
  grossMarginPct: string | null;
  grossMargin: string;
  href: string;
} | null> {
  try {
    const report = await getProjectProfitabilityReport(
      projectId,
      { budgetId, costLayer: "accrued", revenueBasis: "certified", currencyView: "original" },
      ctx,
    );
    if (report.type !== "REPORT" || report.grossMargin === null) return null;
    return {
      currency: report.currency,
      grossMarginPct: report.grossMarginPct,
      grossMargin: report.grossMargin,
      href: `/proyectos/${projectId}/reportes/rentabilidad`,
    };
  } catch {
    return null;
  }
}
