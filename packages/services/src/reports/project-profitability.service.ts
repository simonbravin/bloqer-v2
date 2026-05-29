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

export type ProfitabilityFilters = {
  budgetId?: string;
  costLayer?: CostVarianceLayer;
  revenueBasis?: "certified" | "invoiced";
};

export type ProjectProfitabilityReport = {
  type: "REPORT";
  projectId: string;
  budgetId: string;
  budgetName: string;
  costLayer: CostVarianceLayer;
  revenueBasis: "certified" | "invoiced";
  currency: string;
  revenue: string;
  directCost: string;
  grossMargin: string;
  grossMarginPct: string | null;
  projectedMargin: string;
  budgetTotalSale: string;
  netMarginAvailable: boolean;
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

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const costLayer = parseCostVarianceLayer(filters.costLayer);
  const revenueBasis = filters.revenueBasis === "invoiced" ? "invoiced" : "certified";

  const cc = await getProjectCostControl(projectId, { budgetId: filters.budgetId }, ctx);
  if (cc.type === "NO_APPROVED_BUDGETS") return { type: "NO_APPROVED_BUDGETS" };
  if (cc.type === "BUDGET_SELECTION_REQUIRED") {
    throw new ServiceError("CONFLICT", "Seleccioná un presupuesto aprobado");
  }

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "BUDGETS");
  const warnings: string[] = [
    `Margen bruto: ingresos (${revenueBasis === "certified" ? "certificado aprobado" : "facturado emitido"}) − costos directos (${LAYER_LABELS[costLayer]}).`,
  ];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];
  warnings.push(...cc.warnings);

  let revenue = new Prisma.Decimal(
    revenueBasis === "certified" ? cc.totals.certifiedApproved : "0",
  );

  if (revenueBasis === "invoiced") {
    if (!gate.isEnabled("AR")) {
      sectionsExcluded.push({
        module: "AR",
        section: "invoiced_revenue",
        reason: "TENANT_MODULE_DISABLED",
      });
      warnings.push("AR deshabilitado: ingresos facturados en cero.");
      revenue = new Prisma.Decimal(0);
    } else {
      const invoices = await prisma.salesInvoice.findMany({
        where: {
          tenantId: ctx.tenantId,
          projectId,
          status: "ISSUED",
          certification: { budgetId: cc.budgetId },
        },
        select: { totalAmount: true, currency: true },
      });
      revenue = invoices.reduce((s, i) => s.plus(i.totalAmount), new Prisma.Decimal(0));
      const curSet = new Set(invoices.map((i) => i.currency));
      if (curSet.size > 1) {
        warnings.push("Hay facturas en varias monedas; el margen no convierte tipos de cambio.");
      }
    }
  }

  const directCost = new Prisma.Decimal(getDirectCost(cc.totals, costLayer));
  const grossMargin = revenue.minus(directCost);
  const grossMarginPct = revenue.isZero()
    ? null
    : grossMargin.div(revenue).times(100).toFixed(2);

  const netAvailable = canViewNetMargin(ctx.roles);
  const netMarginNote = netAvailable
    ? "Margen neto (GG, costo financiero e impuestos) pendiente de política tenant [Q-013]."
    : "Margen neto visible solo para OWNER, ADMIN o FINANCE [D-013].";

  const cur = "ARS";

  return {
    type: "REPORT",
    projectId,
    budgetId: cc.budgetId,
    budgetName: cc.budgetName,
    costLayer,
    revenueBasis,
    currency: cur,
    revenue: revenue.toFixed(2),
    directCost: directCost.toFixed(2),
    grossMargin: grossMargin.toFixed(2),
    grossMarginPct,
    projectedMargin: cc.totals.projectedMargin,
    budgetTotalSale: cc.totals.budgetTotalSale,
    netMarginAvailable: false,
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
