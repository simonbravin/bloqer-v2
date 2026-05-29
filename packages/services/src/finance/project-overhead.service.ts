import { Prisma, prisma } from "@bloqer/database";
import { ServiceContext, ServiceError } from "../types";

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

export type ProjectOverheadBreakdown = {
  manualTotal: string;
  calculatedPct: string;
  calculatedAmount: string;
  totalOverhead: string;
  currency: string;
};

export async function getProjectOverheadAmount(
  projectId: string,
  companyId: string,
  directCostAccrued: Prisma.Decimal,
  ctx: ServiceContext,
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
      currency: "ARS",
    };
  }

  const [company, manualRows] = await Promise.all([
    prisma.company.findUnique({
      where: { id: cid },
      select: { overheadAllocationPct: true },
    }),
    prisma.projectOverheadAllocation.findMany({
      where: { tenantId: ctx.tenantId, projectId },
      select: { amount: true, currency: true },
    }),
  ]);

  const manualTotal = manualRows.reduce((s, r) => s.plus(r.amount), ZERO);
  const pct = company?.overheadAllocationPct ?? ZERO;
  const calculatedAmount = directCostAccrued.times(pct).div(HUNDRED);
  const totalOverhead = manualTotal.plus(calculatedAmount);

  return {
    manualTotal: manualTotal.toFixed(2),
    calculatedPct: pct.toFixed(2),
    calculatedAmount: calculatedAmount.toFixed(2),
    totalOverhead: totalOverhead.toFixed(2),
    currency: manualRows[0]?.currency ?? "ARS",
  };
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
  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    throw new ServiceError("VALIDATION", "Período inválido (use YYYY-MM)");
  }
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new ServiceError("VALIDATION", "El monto debe ser mayor a cero");
  }

  return prisma.projectOverheadAllocation.create({
    data: {
      tenantId: ctx.tenantId,
      companyId: input.companyId,
      projectId: input.projectId,
      period: input.period,
      currency: input.currency ?? "ARS",
      amount,
      notes: input.notes ?? null,
      createdBy: ctx.actorUserId,
      updatedBy: ctx.actorUserId,
    },
  });
}
