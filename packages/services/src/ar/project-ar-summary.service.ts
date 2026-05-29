import { Prisma, prisma } from "@bloqer/database";
import { canViewArProjectArea } from "./ar-access";
import { assertArTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";

export type ProjectBillingVsCollectionsSummary = {
  invoicedByCurrency: { currency: string; amount: string }[];
  collectedByCurrency: { currency: string; amount: string }[];
};

/** Lightweight aggregation for project overview billing KPI (no full invoice/collection lists). */
export async function summarizeProjectBillingVsCollections(
  projectId: string,
  ctx: ServiceContext,
): Promise<ProjectBillingVsCollectionsSummary> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const baseWhere = { projectId, tenantId: ctx.tenantId };

  const [invoicedGroups, collectedGroups] = await Promise.all([
    prisma.salesInvoice.groupBy({
      by: ["currency"],
      where: { ...baseWhere, status: "ISSUED" },
      _sum: { totalAmount: true },
    }),
    prisma.collection.groupBy({
      by: ["currency"],
      where: { ...baseWhere, status: "CONFIRMED" },
      _sum: { amount: true },
    }),
  ]);

  const zero = new Prisma.Decimal(0);

  const invoicedByCurrency = invoicedGroups
    .filter((g) => g._sum.totalAmount && g._sum.totalAmount.greaterThan(zero))
    .map((g) => ({ currency: g.currency, amount: g._sum.totalAmount!.toString() }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  const collectedByCurrency = collectedGroups
    .filter((g) => g._sum.amount && g._sum.amount.greaterThan(zero))
    .map((g) => ({ currency: g.currency, amount: g._sum.amount!.toString() }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return { invoicedByCurrency, collectedByCurrency };
}
