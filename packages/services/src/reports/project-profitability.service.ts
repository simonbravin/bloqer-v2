import { Prisma, prisma } from "@bloqer/database";
import type { ProjectStatus } from "@bloqer/database";
import type { UserRole } from "@bloqer/domain";
import {
  getProjectCostControl,
  canViewProjectCostControlReport,
} from "../cost-control/cost-control.service";
import {
  assertTenantModuleEnabledWithGate,
  getTenantModuleGate,
} from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ServiceContext, ServiceError } from "../types";
import type { CostVarianceLayer } from "./budget-variance.service";
import { parseCostVarianceLayer } from "./budget-variance.service";
import {
  canConsolidateInvoicesToArs,
  canConsolidateToArs,
  parseCurrencyView,
  type CurrencyView,
  type ProfitabilityCurrencySlice,
} from "./report-currency-view";
import { getProjectOverheadAmount } from "../finance/project-overhead.service";
import { isPositiveMoneyDecimal } from "../finance/money-decimal";
import { compareDecimal } from "@bloqer/utils";

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
  revenue: string;
  directCost: string;
  grossMargin: string;
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

export async function getProjectProfitabilityReport(
  projectId: string,
  filters: ProfitabilityFilters,
  ctx: ServiceContext,
): Promise<ProjectProfitabilityResult> {
  if (!canViewProjectCostControlReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver rentabilidad del proyecto");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true, companyId: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const costLayer = parseCostVarianceLayer(filters.costLayer);
  const revenueBasis = filters.revenueBasis === "invoiced" ? "invoiced" : "certified";
  const currencyView = parseCurrencyView(filters.currencyView);

  const cc = await getProjectCostControl(projectId, { budgetId: filters.budgetId }, ctx);
  if (cc.type === "NO_APPROVED_BUDGETS") return { type: "NO_APPROVED_BUDGETS" };
  if (cc.type === "BUDGET_SELECTION_REQUIRED") {
    throw new ServiceError("CONFLICT", "Seleccioná un presupuesto aprobado");
  }

  const budgetRow = await prisma.budget.findUnique({
    where: { id: cc.budgetId },
    select: { currency: true },
  });
  const budgetCurrency = budgetRow?.currency ?? "ARS";

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "BUDGETS");
  const warnings: string[] = [
    `Margen bruto: ingresos (${revenueBasis === "certified" ? "certificado aprobado" : "facturado emitido"}) − costos directos (${LAYER_LABELS[costLayer]}). Costos en moneda del presupuesto (${budgetCurrency}).`,
  ];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];
  warnings.push(...cc.warnings);

  const directCost = new Prisma.Decimal(getDirectCost(cc.totals, costLayer));
  const directCostAccrued = new Prisma.Decimal(cc.totals.accruedCost);
  const byCurrency: ProfitabilityCurrencySlice[] = [];
  let revenue = new Prisma.Decimal(0);
  const revenueCurrencies = new Set<string>([budgetCurrency]);

  if (revenueBasis === "certified") {
    revenue = new Prisma.Decimal(cc.totals.certifiedApproved);
    byCurrency.push({
      currency: budgetCurrency,
      revenue: revenue.toFixed(2),
      directCost: directCost.toFixed(2),
      grossMargin: revenue.minus(directCost).toFixed(2),
      grossMarginPct: revenue.isZero()
        ? null
        : revenue.minus(directCost).div(revenue).times(100).toFixed(2),
    });
  } else if (!gate.isEnabled("AR")) {
    sectionsExcluded.push({
      module: "AR",
      section: "invoiced_revenue",
      reason: "TENANT_MODULE_DISABLED",
    });
    warnings.push("AR deshabilitado: ingresos facturados en cero.");
    byCurrency.push({
      currency: budgetCurrency,
      revenue: "0.00",
      directCost: directCost.toFixed(2),
      grossMargin: directCost.negated().toFixed(2),
      grossMarginPct: null,
    });
  } else {
    const invoices = await prisma.salesInvoice.findMany({
      where: {
        tenantId: ctx.tenantId,
        projectId,
        status: "ISSUED",
        certification: { budgetId: cc.budgetId },
      },
      select: { totalAmount: true, currency: true, amountArs: true, fxRate: true },
    });
    const byCur = new Map<string, Prisma.Decimal>();
    const useArsConsolidation =
      currencyView === "ARS" && canConsolidateInvoicesToArs(invoices);
    for (const inv of invoices) {
      revenueCurrencies.add(inv.currency);
      const rev = useArsConsolidation
        ? new Prisma.Decimal(inv.amountArs)
        : new Prisma.Decimal(inv.totalAmount);
      const curKey = useArsConsolidation ? "ARS" : inv.currency;
      byCur.set(curKey, (byCur.get(curKey) ?? new Prisma.Decimal(0)).plus(rev));
    }
    for (const [cur, rev] of byCur) {
      const dc = cur === budgetCurrency ? directCost : new Prisma.Decimal(0);
      const gm = rev.minus(dc);
      byCurrency.push({
        currency: cur,
        revenue: rev.toFixed(2),
        directCost: dc.toFixed(2),
        grossMargin: gm.toFixed(2),
        grossMarginPct: rev.isZero() ? null : gm.div(rev).times(100).toFixed(2),
      });
      if (cur === budgetCurrency) revenue = rev;
    }
    if (byCur.size === 0) {
      byCurrency.push({
        currency: budgetCurrency,
        revenue: "0.00",
        directCost: directCost.toFixed(2),
        grossMargin: directCost.negated().toFixed(2),
        grossMarginPct: null,
      });
    } else {
      revenue = Array.from(byCur.values()).reduce((s, v) => s.plus(v), new Prisma.Decimal(0));
    }
    if (byCur.size > 1) {
      warnings.push(
        "Ingresos facturados en varias monedas: usá vista «Por moneda» o consolidá solo si todos los comprobantes son ARS con FX cargado.",
      );
    }
  }

  const canArs = canConsolidateToArs(revenueCurrencies) && budgetCurrency === "ARS";
  const consolidationBlocked = currencyView === "ARS" && !canArs;

  if (consolidationBlocked) {
    warnings.push(
      "Vista ARS no disponible: hay monedas distintas o el presupuesto no está en ARS. Usá «Por moneda» o cargá FX en comprobantes (fase 3b).",
    );
  }

  const displaySlice =
    currencyView === "original" || consolidationBlocked
      ? byCurrency.find((s) => s.currency === budgetCurrency) ?? byCurrency[0]
      : byCurrency.find((s) => s.currency === "ARS") ?? byCurrency[0];

  const grossMargin = displaySlice
    ? new Prisma.Decimal(displaySlice.grossMargin)
    : revenue.minus(directCost);
  const grossMarginPct = displaySlice?.grossMarginPct ?? null;
  const displayCurrency = consolidationBlocked
    ? budgetCurrency
    : currencyView === "ARS"
      ? "ARS"
      : (displaySlice?.currency ?? budgetCurrency);

  const netAvailable = canViewNetMargin(ctx.roles);
  let netMargin: string | null = null;
  let overheadAmount: string | null = null;
  let overheadManualAmount: string | null = null;
  let overheadCalculatedAmount: string | null = null;
  let overheadCompanyPct: string | null = null;
  let netMarginNote = netAvailable
    ? "Margen neto = margen bruto − GG imputados a la obra [D-040]. Los GG de empresa no entran en EDT y costos."
    : "Margen neto (y GG imputados) visible solo para OWNER o ADMIN [D-013].";

  let netMarginAvailableFlag = false;
  if (netAvailable && project.companyId) {
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
      if (isPositiveMoneyDecimal(oh.autoWeightAmount)) {
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
    if (overheadCurrency === displayCurrency) {
      const nm = new Prisma.Decimal(displaySlice?.grossMargin ?? grossMargin.toFixed(2)).minus(
        oh.totalOverhead,
      );
      netMargin = nm.toFixed(2);
      netMarginAvailableFlag = true;
    } else {
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
    revenue: displaySlice?.revenue ?? revenue.toFixed(2),
    directCost: displaySlice?.directCost ?? directCost.toFixed(2),
    grossMargin: displaySlice?.grossMargin ?? grossMargin.toFixed(2),
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
  currency: string;
  revenue: string;
  directCost: string;
  grossMargin: string;
  grossMarginPct: string | null;
  warning: string | null;
};

export type PortfolioProfitabilityReport = {
  rows: PortfolioProfitabilityRow[];
  consolidatedRevenue: string;
  consolidatedDirectCost: string;
  consolidatedGrossMargin: string;
  consolidatedGrossMarginPct: string | null;
  /** Present when rows mix currencies — consolidated totals only sum the primary currency. */
  consolidatedCurrency: string | null;
  warnings: string[];
};

export async function getPortfolioProfitabilityReport(
  ctx: ServiceContext,
  filters?: PortfolioProfitabilityFilters,
): Promise<PortfolioProfitabilityReport> {
  if (!canViewProjectCostControlReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver rentabilidad multi-obra");
  }

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("PROJECTS") || !gate.isEnabled("BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Módulos de proyectos/presupuestos deshabilitados");
  }

  const statusFilter: Prisma.ProjectWhereInput = filters?.status
    ? { status: filters.status }
    : { status: { not: "CANCELLED" } };

  const projects = await prisma.project.findMany({
    where: { tenantId: ctx.tenantId, ...statusFilter },
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
        currency: "ARS",
        revenue: "0.00",
        directCost: "0.00",
        grossMargin: "0.00",
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
        currency: "ARS",
        revenue: "0.00",
        directCost: "0.00",
        grossMargin: "0.00",
        grossMarginPct: null,
        warning: "Sin presupuesto aprobado",
      });
      continue;
    }
    const rev = new Prisma.Decimal(report.revenue);
    const dc = new Prisma.Decimal(report.directCost);
    const bucket = byCurrency.get(report.currency) ?? {
      revenue: new Prisma.Decimal(0),
      directCost: new Prisma.Decimal(0),
    };
    bucket.revenue = bucket.revenue.plus(rev);
    bucket.directCost = bucket.directCost.plus(dc);
    byCurrency.set(report.currency, bucket);
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
      warning: null,
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
  } else {
    for (const [ccy, bucket] of byCurrency) {
      if (bucket.revenue.abs().greaterThan(primaryRev.abs()) || primaryCurrency == null) {
        primaryCurrency = ccy;
        primaryRev = bucket.revenue;
        primaryDc = bucket.directCost;
      }
    }
  }
  if (byCurrency.size > 1) {
    warnings.push(
      `Hay proyectos en ${[...byCurrency.keys()].join(", ")}. El consolidado suma solo ${primaryCurrency}.`,
    );
  }

  const consolidatedGrossMargin = primaryRev.minus(primaryDc);
  return {
    rows,
    consolidatedRevenue: primaryRev.toFixed(2),
    consolidatedDirectCost: primaryDc.toFixed(2),
    consolidatedGrossMargin: consolidatedGrossMargin.toFixed(2),
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
): Promise<{
  currency: string;
  grossMarginPct: string | null;
  grossMargin: string;
  href: string;
} | null> {
  try {
    const report = await getProjectProfitabilityReport(
      projectId,
      { costLayer: "accrued", revenueBasis: "certified" },
      ctx,
    );
    if (report.type !== "REPORT") return null;
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
