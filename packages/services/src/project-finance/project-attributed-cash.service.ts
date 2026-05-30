import { Prisma, prisma } from "@bloqer/database";
import { startOfDayUtc } from "../finance/obligation-date";
import { canViewProjectCashFlowReport } from "../project-cash-flow/project-cash-flow.service";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";

export type ProjectAttributedCashByCurrency = {
  currency: string;
  totalInflows: string;
  totalOutflows: string;
  netBalance: string;
  isNegative: boolean;
};

export type ProjectAttributedCashInceptionSource = "startDate" | "createdAt" | "firstMovement";

export type ProjectAttributedCashBalance = {
  visible: boolean;
  inceptionDate: string;
  inceptionSource: ProjectAttributedCashInceptionSource;
  byCurrency: ProjectAttributedCashByCurrency[];
};

const ZERO = new Prisma.Decimal(0);

function resolveInceptionDate(project: {
  startDate: Date | null;
  createdAt: Date;
}): { date: Date; source: "startDate" | "createdAt" } {
  if (project.startDate) {
    return { date: startOfDayUtc(new Date(project.startDate)), source: "startDate" };
  }
  return { date: startOfDayUtc(new Date(project.createdAt)), source: "createdAt" };
}

/** Incluye anticipos u otros movimientos anteriores al startDate programado (p. ej. obra con inicio futuro). */
export function resolveEffectiveInceptionDate(
  base: { date: Date; source: "startDate" | "createdAt" },
  earliestMovement: Date | null,
): { date: Date; source: ProjectAttributedCashInceptionSource } {
  if (!earliestMovement) return base;
  const movementDay = startOfDayUtc(earliestMovement);
  if (movementDay < base.date) {
    return { date: movementDay, source: "firstMovement" };
  }
  return base;
}

async function findEarliestConfirmedMovementDate(
  projectId: string,
  tenantId: string,
  includeAr: boolean,
  includeAp: boolean,
): Promise<Date | null> {
  const candidates: Date[] = [];

  if (includeAr) {
    const firstCollection = await prisma.collection.findFirst({
      where: { tenantId, projectId, status: "CONFIRMED" },
      orderBy: { collectionDate: "asc" },
      select: { collectionDate: true },
    });
    if (firstCollection) candidates.push(new Date(firstCollection.collectionDate));
  }

  if (includeAp) {
    const firstPayment = await prisma.payment.findFirst({
      where: { tenantId, projectId, status: "CONFIRMED" },
      orderBy: { paymentDate: "asc" },
      select: { paymentDate: true },
    });
    if (firstPayment) candidates.push(new Date(firstPayment.paymentDate));
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((earliest, d) => (d < earliest ? d : earliest));
}

/** Caja imputada acumulada desde inicio de obra: Σ cobranzas − Σ pagos confirmados (sin saldo inicial artificial). */
export async function getProjectAttributedCashBalance(
  projectId: string,
  ctx: ServiceContext,
): Promise<ProjectAttributedCashBalance> {
  if (!canViewProjectCashFlowReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver flujo de caja del proyecto");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true, startDate: true, createdAt: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const gate = await getTenantModuleGate(ctx);
  const includeAr = gate.isEnabled("AR");
  const includeAp = gate.isEnabled("AP");

  if (!includeAr && !includeAp) {
    return { visible: false, inceptionDate: "", inceptionSource: "createdAt", byCurrency: [] };
  }

  const baseInception = resolveInceptionDate(project);
  const earliestMovement = await findEarliestConfirmedMovementDate(
    projectId,
    ctx.tenantId,
    includeAr,
    includeAp,
  );
  const { date: inceptionDate, source: inceptionSource } = resolveEffectiveInceptionDate(
    baseInception,
    earliestMovement,
  );

  const [collections, payments] = await Promise.all([
    includeAr
      ? prisma.collection.findMany({
          where: {
            tenantId: ctx.tenantId,
            projectId,
            status: "CONFIRMED",
            collectionDate: { gte: inceptionDate },
          },
          select: { currency: true, amount: true },
        })
      : Promise.resolve([]),
    includeAp
      ? prisma.payment.findMany({
          where: {
            tenantId: ctx.tenantId,
            projectId,
            status: "CONFIRMED",
            paymentDate: { gte: inceptionDate },
          },
          select: { currency: true, amount: true },
        })
      : Promise.resolve([]),
  ]);

  const inflows = new Map<string, Prisma.Decimal>();
  const outflows = new Map<string, Prisma.Decimal>();

  for (const c of collections) {
    inflows.set(c.currency, (inflows.get(c.currency) ?? ZERO).add(c.amount));
  }
  for (const p of payments) {
    outflows.set(p.currency, (outflows.get(p.currency) ?? ZERO).add(p.amount));
  }

  const currencies = new Set([...inflows.keys(), ...outflows.keys()]);
  const byCurrency: ProjectAttributedCashByCurrency[] = [...currencies]
    .sort((a, b) => (a === "ARS" ? -1 : b === "ARS" ? 1 : a.localeCompare(b)))
    .map((currency) => {
      const inf = inflows.get(currency) ?? ZERO;
      const out = outflows.get(currency) ?? ZERO;
      const net = inf.minus(out);
      return {
        currency,
        totalInflows: inf.toString(),
        totalOutflows: out.toString(),
        netBalance: net.toString(),
        isNegative: net.lessThan(0),
      };
    });

  return {
    visible: byCurrency.length > 0 || includeAr || includeAp,
    inceptionDate: inceptionDate.toISOString().slice(0, 10),
    inceptionSource,
    byCurrency,
  };
}
