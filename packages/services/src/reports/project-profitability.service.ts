import { Prisma, prisma } from "@bloqer/database";
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
  netMarginNote: string;
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

export type ProjectProfitabilityEmpty = { type: "NO_APPROVED_BUDGETS" };

export type ProjectProfitabilityResult = ProjectProfitabilityReport | ProjectProfitabilityEmpty;

function canViewNetMargin(roles: UserRole[]): boolean {
  return roles.includes("OWNER") || roles.includes("ADMIN") || roles.includes("FINANCE");
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
  let netMarginNote = netAvailable
    ? "Margen neto = margen bruto − GG (imputación manual + % empresa sobre CD devengado) [D-040]."
    : "Margen neto visible solo para OWNER, ADMIN o FINANCE [D-013].";

  let netMarginAvailableFlag = false;
  if (netAvailable && project.companyId) {
    const oh = await getProjectOverheadAmount(
      projectId,
      project.companyId,
      directCost,
      ctx,
    );
    overheadAmount = oh.totalOverhead;
    const nm = new Prisma.Decimal(displaySlice?.grossMargin ?? grossMargin.toFixed(2)).minus(
      oh.totalOverhead,
    );
    netMargin = nm.toFixed(2);
    netMarginAvailableFlag = true;
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
    netMarginNote,
    warnings,
    sectionsExcluded,
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
