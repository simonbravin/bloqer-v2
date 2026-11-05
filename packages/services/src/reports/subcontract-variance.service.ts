import { Prisma, prisma, type SubcontractStatus } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { assertBudgetCostGraph } from "../budget/budget-cost-graph";
import { assertBudgetCurrency } from "../cost-control/comparison-currency";
import { canViewSubcontractsArea } from "../subcontracts/subcontract-access";
import { assertTenantModuleEnabledWithGate, getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ServiceContext, ServiceError } from "../types";
import { requireProjectAccess } from "../security/access";
import { validateResourceVarianceDates } from "../resources/resource-variance-filters";
import { compareWbsCodes } from "../budget/wbs-code-rules";
import { listApprovedBudgetsForProject, resolveApprovedBudgetForProject } from "./report-budget-resolve";
import { monthKey, monthLabel, parseFilterDate } from "./report-month";

export type SubcontractReportFilters = {
  budgetId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type SubcontractWbsVarianceRow = {
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  budgetSubcontract: string;
  committedCost: string;
  certifiedCost: string;
  varianceCommitted: string;
  variancePct: string | null;
  status: "OK" | "UNDER" | "OVER" | "NO_BASELINE" | "PENDING_CONTRACT";
};

export type SubcontractContractRow = {
  subcontractId: string;
  code: string;
  title: string;
  subcontractorName: string;
  status: SubcontractStatus;
  totalValue: string;
  certifiedCost: string;
  wbsLinked: boolean;
};

export type SubcontractCertEvolutionPoint = {
  periodKey: string;
  periodLabel: string;
  certifiedAmount: string;
  paidAmount: string;
};

export type SubcontractVarianceReport = {
  type: "REPORT";
  projectId: string;
  budgetId: string;
  budgetName: string;
  currency: string;
  apAvailable: boolean;
  byWbs: SubcontractWbsVarianceRow[];
  contracts: SubcontractContractRow[];
  monthlyCertification: SubcontractCertEvolutionPoint[];
  pendingContractCount: number;
  withoutBaselineCount: number;
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

export type SubcontractReportEmpty = { type: "NO_APPROVED_BUDGETS" };

export type SubcontractReportResult = SubcontractVarianceReport | SubcontractReportEmpty;

export async function getSubcontractVarianceReport(
  projectId: string,
  filters: SubcontractReportFilters,
  ctx: ServiceContext,
): Promise<SubcontractReportResult> {
  if (!canViewSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver reportes de subcontratos");
  }

  validateResourceVarianceDates(filters);
  const project = await requireProjectAccess(projectId, ctx);
  const companyId = project.companyId ?? ctx.companyId;
  const scope = { tenantId: ctx.tenantId, projectId, ...(companyId ? { companyId } : {}) };
  const dates = {
    ...(filters.dateFrom ? { gte: parseFilterDate(filters.dateFrom, false) } : {}),
    ...(filters.dateTo ? { lte: parseFilterDate(filters.dateTo, true) } : {}),
  };
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "SUBCONTRACTS");

  const budget = await resolveApprovedBudgetForProject(projectId, filters.budgetId, ctx);
  if (!budget) return { type: "NO_APPROVED_BUDGETS" };
  await assertBudgetCostGraph(budget.id);

  const warnings: string[] = [];
  if (filters.dateFrom || filters.dateTo) {
    warnings.push("El contratado refleja los contratos activos. Las fechas filtran las certificaciones y los pagos.");
  }
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];

  const apAvailable = gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP");
  if (!gate.isEnabled("AP")) {
    sectionsExcluded.push({
      module: "AP",
      section: "Pagos subcontrato",
      reason: "TENANT_MODULE_DISABLED",
    });
  }
  if (!apAvailable) warnings.push("Pagos de subcontrato no disponibles para este reporte.");

  const wbsLeaves = await prisma.wbsNode.findMany({
    where: { budgetId: budget.id, type: "ITEM" },
    select: { id: true, code: true, name: true },
  });
  wbsLeaves.sort((a, b) => compareWbsCodes(a.code, b.code));

  const costItems = await prisma.costItem.findMany({
    where: { budgetId: budget.id, wbsNode: { budgetId: budget.id, type: "ITEM" } },
    select: {
      wbsNodeId: true,
      quantity: true,
      analysisLines: {
        where: { budgetId: budget.id, category: "SUBCONTRACT" },
        select: { totalCost: true },
      },
    },
  });

  const budgetSubMap = new Map<string, Prisma.Decimal>();
  for (const ci of costItems) {
    const unit = ci.analysisLines.reduce((s, l) => s.plus(l.totalCost), new Prisma.Decimal(0));
    budgetSubMap.set(ci.wbsNodeId, unit.times(ci.quantity));
  }

  const committedByWbs = new Map<string, Prisma.Decimal>();
  const certifiedByWbs = new Map<string, Prisma.Decimal>();
  const hasActiveSubOnWbs = new Set<string>();

  const monthlyMap = new Map<string, { certified: Prisma.Decimal; paid: Prisma.Decimal }>();

  const contracts: SubcontractContractRow[] = [];

  {
    const activeSubs = await prisma.subcontract.findMany({
      where: { ...scope, status: "ACTIVE", subcontractorContact: { tenantId: ctx.tenantId } },
      select: {
        id: true,
        companyId: true,
        currency: true,
        number: true,
        title: true,
        status: true,
        subcontractorContact: { select: { legalName: true, fantasyName: true } },
        lines: { select: { wbsNodeId: true, lineTotal: true } },
        certifications: {
          where: { ...scope, status: "APPROVED", certificationDate: dates },
          select: {
            companyId: true,
            lines: { select: { lineTotal: true, subcontractLine: { select: { subcontractId: true } } } },
          },
        },
      },
    });

    for (const sc of activeSubs) {
      assertBudgetCurrency(budget.currency, sc.currency);
      const total = sc.lines.reduce((s, l) => s.plus(l.lineTotal), new Prisma.Decimal(0));
      const certTotal = sc.certifications.filter((cert) => cert.companyId === sc.companyId)
        .flatMap((cert) => cert.lines).filter((line) => line.subcontractLine.subcontractId === sc.id)
        .reduce((sum, line) => sum.add(line.lineTotal), new Prisma.Decimal(0));
      contracts.push({
        subcontractId: sc.id,
        code: `SC-${String(sc.number).padStart(3, "0")}`,
        title: sc.title,
        subcontractorName:
          sc.subcontractorContact.fantasyName ?? sc.subcontractorContact.legalName,
        status: sc.status,
        totalValue: total.toFixed(2),
        certifiedCost: certTotal.toFixed(2),
        wbsLinked: sc.lines.some((l) => l.wbsNodeId != null),
      });

      for (const line of sc.lines) {
        if (!line.wbsNodeId) continue;
        hasActiveSubOnWbs.add(line.wbsNodeId);
        committedByWbs.set(
          line.wbsNodeId,
          (committedByWbs.get(line.wbsNodeId) ?? new Prisma.Decimal(0)).add(line.lineTotal),
        );
      }
    }

    const certLines = await prisma.subcontractCertificationLine.findMany({
      where: {
        certification: {
          ...scope,
          status: "APPROVED",
          certificationDate: dates,
          subcontract: { ...scope },
        },
      },
      select: {
        lineTotal: true,
        certification: {
          select: {
            certificationDate: true, subcontractId: true, companyId: true,
            subcontract: { select: { currency: true, companyId: true } },
          },
        },
        subcontractLine: { select: { subcontractId: true, wbsNodeId: true } },
      },
    });

    for (const cl of certLines) {
      if (cl.subcontractLine.subcontractId !== cl.certification.subcontractId ||
        cl.certification.companyId !== cl.certification.subcontract.companyId) continue;
      assertBudgetCurrency(budget.currency, cl.certification.subcontract.currency);
      const wbsId = cl.subcontractLine.wbsNodeId;
      if (wbsId) {
        certifiedByWbs.set(
          wbsId,
          (certifiedByWbs.get(wbsId) ?? new Prisma.Decimal(0)).add(cl.lineTotal),
        );
      }
      const key = monthKey(cl.certification.certificationDate);
      const bucket = monthlyMap.get(key) ?? {
        certified: new Prisma.Decimal(0),
        paid: new Prisma.Decimal(0),
      };
      bucket.certified = bucket.certified.add(cl.lineTotal);
      monthlyMap.set(key, bucket);
    }
  }

  if (apAvailable) {
    const payments = await prisma.payment.findMany({
      where: {
        ...scope,
        status: "CONFIRMED",
        paymentDate: dates,
        supplierInvoice: { ...scope, subcontractCertification: { ...scope, subcontract: { ...scope } } },
      },
      select: {
        amount: true,
        currency: true,
        companyId: true,
        paymentDate: true,
        supplierInvoice: {
          select: { companyId: true, subcontractCertification: { select: { companyId: true, subcontract: { select: { companyId: true } } } } },
        },
      },
    });
    for (const p of payments) {
      const cert = p.supplierInvoice.subcontractCertification;
      if (!cert || p.companyId !== p.supplierInvoice.companyId || p.companyId !== cert.companyId ||
        p.companyId !== cert.subcontract.companyId) continue;
      assertBudgetCurrency(budget.currency, p.currency);
      const key = monthKey(p.paymentDate);
      const bucket = monthlyMap.get(key) ?? {
        certified: new Prisma.Decimal(0),
        paid: new Prisma.Decimal(0),
      };
      bucket.paid = bucket.paid.add(p.amount);
      monthlyMap.set(key, bucket);
    }
  }

  let pendingContractCount = 0;
  let withoutBaselineCount = 0;

  const byWbs: SubcontractWbsVarianceRow[] = wbsLeaves.map((w) => {
    const budgetSub = budgetSubMap.get(w.id) ?? new Prisma.Decimal(0);
    const committed = committedByWbs.get(w.id) ?? new Prisma.Decimal(0);
    const certified = certifiedByWbs.get(w.id) ?? new Prisma.Decimal(0);
    const variance = budgetSub.minus(committed);
    const pct = budgetSub.isZero() ? null : variance.div(budgetSub).times(100).toFixed(2);

    let status: SubcontractWbsVarianceRow["status"] = "OK";
    if (budgetSub.isZero() && committed.greaterThan(0)) {
      status = "NO_BASELINE";
      withoutBaselineCount += 1;
    } else if (budgetSub.greaterThan(0) && !hasActiveSubOnWbs.has(w.id)) {
      status = "PENDING_CONTRACT";
      pendingContractCount += 1;
    } else if (committed.greaterThan(budgetSub) && !budgetSub.isZero()) {
      status = "OVER";
    } else if (committed.lessThan(budgetSub) && budgetSub.greaterThan(0)) {
      status = "UNDER";
    }

    return {
      wbsNodeId: w.id,
      wbsCode: w.code,
      wbsName: w.name,
      budgetSubcontract: budgetSub.toFixed(2),
      committedCost: committed.toFixed(2),
      certifiedCost: certified.toFixed(2),
      varianceCommitted: variance.toFixed(2),
      variancePct: pct,
      status,
    };
  });

  const monthlyCertification: SubcontractCertEvolutionPoint[] = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodKey, v]) => ({
      periodKey,
      periodLabel: monthLabel(periodKey),
      certifiedAmount: v.certified.toFixed(2),
      paidAmount: v.paid.toFixed(2),
    }));

  return {
    type: "REPORT",
    projectId,
    budgetId: budget.id,
    budgetName: budget.name,
    currency: budget.currency,
    apAvailable,
    byWbs,
    contracts,
    monthlyCertification,
    pendingContractCount,
    withoutBaselineCount,
    warnings,
    sectionsExcluded,
  };
}

export async function listSubcontractReportBudgets(projectId: string, ctx: ServiceContext) {
  if (!canViewSubcontractsArea(ctx.roles)) throw new ServiceError("FORBIDDEN", "Sin permisos");
  return listApprovedBudgetsForProject(projectId, ctx);
}
