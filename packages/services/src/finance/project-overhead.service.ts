import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { ServiceContext, ServiceError } from "../types";

function assertOverheadEdit(ctx: ServiceContext) {
  if (!can(ctx.roles, "EDIT", "AP") && !can(ctx.roles, "APPROVE", "TENANT_SETTINGS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar imputaciones de gastos generales");
  }
}

function assertOverheadView(ctx: ServiceContext) {
  if (!can(ctx.roles, "VIEW", "AP") && !can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver imputaciones de gastos generales");
  }
}

export type ProjectOverheadAllocationView = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  companyId: string;
  period: string;
  currency: string;
  amount: string;
  notes: string | null;
  createdAt: string;
};

export type CompanyOverheadSettings = {
  companyId: string;
  companyName: string;
  overheadAllocationPct: string;
};

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

/** Q-013 opción 3 — prorrateo automático por peso de CD del período (fase posterior). */
export const OVERHEAD_AUTO_WEIGHT_PRORATION_AVAILABLE = false;

export type ProjectOverheadPeriodFilter = {
  /** Inclusive YYYY-MM */
  periodFrom?: string;
  /** Inclusive YYYY-MM */
  periodTo?: string;
};

export function assertValidOverheadPeriod(period: string): void {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new ServiceError("VALIDATION", "Período inválido (use YYYY-MM)");
  }
  const month = Number.parseInt(period.slice(5, 7), 10);
  if (month < 1 || month > 12) {
    throw new ServiceError("VALIDATION", "Mes inválido en el período (01–12)");
  }
}

async function resolveProjectBudgetCurrency(projectId: string, ctx: ServiceContext): Promise<string> {
  const budget = await prisma.budget.findFirst({
    where: {
      projectId,
      tenantId: ctx.tenantId,
      status: { in: ["APPROVED", "CLOSED"] },
    },
    select: { currency: true },
    orderBy: { updatedAt: "desc" },
  });
  return budget?.currency ?? "ARS";
}

function manualRowInPeriod(period: string, filter?: ProjectOverheadPeriodFilter): boolean {
  if (!filter?.periodFrom && !filter?.periodTo) return true;
  if (filter.periodFrom && period < filter.periodFrom) return false;
  if (filter.periodTo && period > filter.periodTo) return false;
  return true;
}

export type ProjectOverheadBreakdown = {
  manualTotal: string;
  calculatedPct: string;
  calculatedAmount: string;
  totalOverhead: string;
  currency: string;
  /** Imputaciones manuales en otra moneda (no sumadas al total). */
  manualRowsExcluded: number;
};

export async function getProjectOverheadAmount(
  projectId: string,
  companyId: string,
  directCostAccrued: Prisma.Decimal,
  ctx: ServiceContext,
  /** Moneda del CD devengado / presupuesto — solo suma imputaciones manuales en esta moneda (D-040). */
  targetCurrency = "ARS",
  periodFilter?: ProjectOverheadPeriodFilter,
): Promise<ProjectOverheadBreakdown> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true, companyId: true },
  });
  if (!project || project.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  }

  const cid = companyId || project.companyId;
  if (!cid) {
    return {
      manualTotal: "0.00",
      calculatedPct: "0.00",
      calculatedAmount: "0.00",
      totalOverhead: "0.00",
      currency: targetCurrency,
      manualRowsExcluded: 0,
    };
  }

  const [company, manualRows] = await Promise.all([
    prisma.company.findUnique({
      where: { id: cid },
      select: { overheadAllocationPct: true },
    }),
    prisma.projectOverheadAllocation.findMany({
      where: { tenantId: ctx.tenantId, projectId },
      select: { amount: true, currency: true, period: true },
    }),
  ]);

  const manualInScope = manualRows.filter(
    (r) => r.currency === targetCurrency && manualRowInPeriod(r.period, periodFilter),
  );
  const manualTotal = manualInScope.reduce((s, r) => s.plus(r.amount), ZERO);
  const manualRowsExcluded = manualRows.length - manualInScope.length;
  const pct = company?.overheadAllocationPct ?? ZERO;
  const calculatedAmount = directCostAccrued.times(pct).div(HUNDRED);
  const totalOverhead = manualTotal.plus(calculatedAmount);

  return {
    manualTotal: manualTotal.toFixed(2),
    calculatedPct: pct.toFixed(2),
    calculatedAmount: calculatedAmount.toFixed(2),
    totalOverhead: totalOverhead.toFixed(2),
    currency: targetCurrency,
    manualRowsExcluded,
  };
}

export async function listActiveProjectsForOverhead(
  companyId: string,
  ctx: ServiceContext,
): Promise<{ id: string; code: string; name: string; currency: string }[]> {
  assertOverheadView(ctx);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { tenantId: true },
  });
  if (!company) throw new ServiceError("NOT_FOUND", "Empresa no encontrada");
  if (company.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const projects = await prisma.project.findMany({
    where: {
      tenantId: ctx.tenantId,
      companyId,
      status: { in: ["ACTIVE", "ON_HOLD", "DRAFT"] },
    },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
  if (projects.length === 0) return [];

  const budgets = await prisma.budget.findMany({
    where: {
      tenantId: ctx.tenantId,
      projectId: { in: projects.map((p) => p.id) },
      status: { in: ["APPROVED", "CLOSED"] },
    },
    select: { projectId: true, currency: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  const currencyByProject = new Map<string, string>();
  for (const b of budgets) {
    if (!currencyByProject.has(b.projectId)) currencyByProject.set(b.projectId, b.currency);
  }

  return projects.map((p) => ({
    ...p,
    currency: currencyByProject.get(p.id) ?? "ARS",
  }));
}

export async function listProjectOverheadAllocations(
  filters: { companyId?: string; projectId?: string },
  ctx: ServiceContext,
): Promise<ProjectOverheadAllocationView[]> {
  assertOverheadView(ctx);

  const rows = await prisma.projectOverheadAllocation.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(filters.companyId ? { companyId: filters.companyId } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
    },
    include: {
      project: { select: { code: true, name: true } },
    },
    orderBy: [{ period: "desc" }, { createdAt: "desc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    projectCode: r.project.code,
    projectName: r.project.name,
    companyId: r.companyId,
    period: r.period,
    currency: r.currency,
    amount: r.amount.toFixed(2),
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getCompanyOverheadSettings(
  companyId: string,
  ctx: ServiceContext,
): Promise<CompanyOverheadSettings> {
  assertOverheadView(ctx);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, tenantId: true, overheadAllocationPct: true },
  });
  if (!company) throw new ServiceError("NOT_FOUND", "Empresa no encontrada");
  if (company.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return {
    companyId: company.id,
    companyName: company.name,
    overheadAllocationPct: company.overheadAllocationPct.toFixed(2),
  };
}

export async function updateCompanyOverheadAllocationPct(
  companyId: string,
  overheadAllocationPct: number,
  ctx: ServiceContext,
): Promise<CompanyOverheadSettings> {
  assertOverheadEdit(ctx);
  const existing = await prisma.company.findUnique({
    where: { id: companyId },
    select: { tenantId: true },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Empresa no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const company = await prisma.company.update({
    where: { id: companyId },
    data: {
      overheadAllocationPct: new Prisma.Decimal(overheadAllocationPct),
    },
    select: { id: true, name: true, tenantId: true, overheadAllocationPct: true },
  });
  return {
    companyId: company.id,
    companyName: company.name,
    overheadAllocationPct: company.overheadAllocationPct.toFixed(2),
  };
}

export async function deleteProjectOverheadAllocation(id: string, ctx: ServiceContext): Promise<void> {
  assertOverheadEdit(ctx);
  const row = await prisma.projectOverheadAllocation.findUnique({ where: { id } });
  if (!row) throw new ServiceError("NOT_FOUND", "Imputación no encontrada");
  if (row.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await prisma.projectOverheadAllocation.delete({ where: { id } });
}

export async function createProjectOverheadAllocation(
  input: {
    projectId: string;
    companyId: string;
    period: string;
    amount: string;
    currency?: string;
    notes?: string | null;
  },
  ctx: ServiceContext,
) {
  assertOverheadEdit(ctx);
  assertValidOverheadPeriod(input.period);
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(input.amount);
  } catch {
    throw new ServiceError("VALIDATION", "Monto inválido");
  }
  if (amount.lessThanOrEqualTo(0)) {
    throw new ServiceError("VALIDATION", "El monto debe ser mayor a cero");
  }

  const [project, company] = await Promise.all([
    prisma.project.findUnique({
      where: { id: input.projectId },
      select: { tenantId: true, companyId: true },
    }),
    prisma.company.findUnique({
      where: { id: input.companyId },
      select: { tenantId: true },
    }),
  ]);
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (!company) throw new ServiceError("NOT_FOUND", "Empresa no encontrada");
  if (project.tenantId !== ctx.tenantId || company.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  if (project.companyId && project.companyId !== input.companyId) {
    throw new ServiceError("VALIDATION", "El proyecto no pertenece a esa empresa");
  }

  const budgetCurrency = await resolveProjectBudgetCurrency(input.projectId, ctx);
  const currency = (input.currency ?? budgetCurrency).toUpperCase();
  if (currency !== budgetCurrency) {
    throw new ServiceError(
      "VALIDATION",
      `La imputación debe estar en ${budgetCurrency} (moneda del presupuesto aprobado del proyecto)`,
    );
  }

  try {
    return await prisma.projectOverheadAllocation.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: input.companyId,
        projectId: input.projectId,
        period: input.period,
        currency,
        amount,
        notes: input.notes ?? null,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ServiceError(
        "CONFLICT",
        "Ya existe una imputación para ese proyecto en el período indicado",
      );
    }
    throw e;
  }
}
