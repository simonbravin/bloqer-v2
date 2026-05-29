import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { canViewSubcontractsArea } from "../subcontracts/subcontract-access";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ServiceContext, ServiceError } from "../types";
import { listApprovedBudgetsForProject, resolveApprovedBudgetForProject } from "./report-budget-resolve";
import { monthKey, monthLabel } from "./report-month";

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
  status: string;
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
  if (!canViewSubcontractsArea(ctx.roles) && !can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver reportes de subcontratos");
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const budget = await resolveApprovedBudgetForProject(projectId, filters.budgetId, ctx);
  if (!budget) return { type: "NO_APPROVED_BUDGETS" };

  const gate = await getTenantModuleGate(ctx);
  const warnings: string[] = [];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];

  const subEnabled = gate.isEnabled("SUBCONTRACTS");
  const apEnabled = gate.isEnabled("AP");

  if (!subEnabled) {
    sectionsExcluded.push({
      module: "SUBCONTRACTS",
      section: "Subcontratos",
      reason: "TENANT_MODULE_DISABLED",
    });
    warnings.push("Subcontratos deshabilitados.");
  }
  if (!apEnabled) {
    sectionsExcluded.push({
      module: "AP",
      section: "Pagos subcontrato",
      reason: "TENANT_MODULE_DISABLED",
    });
    warnings.push("AP deshabilitado: pagos de certificación en cero.");
  }

  const wbsLeaves = await prisma.wbsNode.findMany({
    where: { budgetId: budget.id, type: "ITEM" },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  const costItems = await prisma.costItem.findMany({
    where: { budgetId: budget.id },
    select: {
      wbsNodeId: true,
      quantity: true,
      analysisLines: {
        where: { category: "SUBCONTRACT" },
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

  if (subEnabled) {
    const activeSubs = await prisma.subcontract.findMany({
      where: { projectId, tenantId: ctx.tenantId, status: "ACTIVE" },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        subcontractorContact: { select: { legalName: true, fantasyName: true } },
        lines: { select: { wbsNodeId: true, lineTotal: true } },
        certifications: {
          where: { status: "APPROVED" },
          select: { lines: { select: { lineTotal: true } } },
        },
      },
    });

    for (const sc of activeSubs) {
      const total = sc.lines.reduce((s, l) => s.plus(l.lineTotal), new Prisma.Decimal(0));
      const certTotal = sc.certifications.reduce(
        (s, c) => s.plus(c.lines.reduce((ls, cl) => ls.plus(cl.lineTotal), new Prisma.Decimal(0))),
        new Prisma.Decimal(0),
      );
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
          projectId,
          tenantId: ctx.tenantId,
          status: "APPROVED",
        },
      },
      select: {
        lineTotal: true,
        certification: { select: { certificationDate: true } },
        subcontractLine: { select: { wbsNodeId: true } },
      },
    });

    for (const cl of certLines) {
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

  if (apEnabled && subEnabled) {
    const payments = await prisma.payment.findMany({
      where: {
        projectId,
        tenantId: ctx.tenantId,
        status: "CONFIRMED",
        supplierInvoice: { subcontractCertificationId: { not: null } },
      },
      select: {
        amount: true,
        paymentDate: true,
      },
    });
    for (const p of payments) {
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
  return listApprovedBudgetsForProject(projectId, ctx);
}
