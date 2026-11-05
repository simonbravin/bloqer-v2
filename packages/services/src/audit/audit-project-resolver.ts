import { prisma } from "@bloqer/database";
import { companyScopeFilter } from "../company-scope";
import type { ServiceContext } from "../types";

const MAX_ENTITY_IDS = 5000;

type Resolver = (ctx: ServiceContext, projectId: string) => Promise<string[]>;

function projectCompanyWhere(ctx: ServiceContext, projectId: string) {
  return { tenantId: ctx.tenantId, projectId, ...(ctx.companyId ? { companyId: ctx.companyId } : {}) };
}

function sharedProjectCompanyWhere(ctx: ServiceContext, projectId: string) {
  return { tenantId: ctx.tenantId, projectId, ...companyScopeFilter(ctx) };
}

const entityIdPage = { select: { id: true }, orderBy: { id: "asc" }, take: MAX_ENTITY_IDS } as const;

const DIRECT_PROJECT_ID_RESOLVERS: Record<string, Resolver> = {
  PurchaseRequest: async (ctx, projectId) =>
    ids(await prisma.purchaseRequest.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  ProcurementQuote: async (ctx, projectId) =>
    ids(await prisma.procurementQuote.findMany({
      where: { tenantId: ctx.tenantId, purchaseRequest: projectCompanyWhere(ctx, projectId) }, ...entityIdPage,
    })),
  DocumentFolder: async (ctx, projectId) =>
    ids(await prisma.documentFolder.findMany({ where: { tenantId: ctx.tenantId, projectId }, ...entityIdPage })),
  Project: async (_ctx, projectId) => [projectId],
  ProjectMembership: async (ctx, projectId) =>
    ids(await prisma.projectMembership.findMany({ where: { tenantId: ctx.tenantId, projectId }, ...entityIdPage })),
  ProjectTeamMember: async (ctx, projectId) =>
    ids(await prisma.projectTeamMember.findMany({ where: { tenantId: ctx.tenantId, projectId }, ...entityIdPage })),
  BudgetSettings: async (ctx, projectId) =>
    ids(await prisma.budgetSettings.findMany({ where: { budget: sharedProjectCompanyWhere(ctx, projectId) }, ...entityIdPage })),
  PurchaseOrder: async (ctx, projectId) =>
    ids(await prisma.purchaseOrder.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  PurchaseReceipt: async (ctx, projectId) =>
    ids(await prisma.purchaseReceipt.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  Payment: async (ctx, projectId) =>
    ids(await prisma.payment.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  Budget: async (ctx, projectId) =>
    ids(await prisma.budget.findMany({ where: sharedProjectCompanyWhere(ctx, projectId), ...entityIdPage })),
  Certification: async (ctx, projectId) =>
    ids(await prisma.certification.findMany({ where: sharedProjectCompanyWhere(ctx, projectId), ...entityIdPage })),
  SalesInvoice: async (ctx, projectId) =>
    ids(await prisma.salesInvoice.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  Receivable: async (ctx, projectId) =>
    ids(await prisma.receivable.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  Collection: async (ctx, projectId) =>
    ids(await prisma.collection.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  SupplierInvoice: async (ctx, projectId) =>
    ids(await prisma.supplierInvoice.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  Payable: async (ctx, projectId) =>
    ids(await prisma.payable.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  AccountMovement: async (ctx, projectId) =>
    ids(await prisma.accountMovement.findMany({ where: { tenantId: ctx.tenantId, projectId }, ...entityIdPage })),
  JournalEntry: async (ctx, projectId) =>
    ids(await prisma.journalEntry.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  Subcontract: async (ctx, projectId) =>
    ids(await prisma.subcontract.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  SubcontractCertification: async (ctx, projectId) =>
    ids(await prisma.subcontractCertification.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  JobsiteLog: async (ctx, projectId) =>
    ids(await prisma.jobsiteLog.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  Warehouse: async (ctx, projectId) =>
    ids(await prisma.warehouse.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  StockMovement: async (ctx, projectId) =>
    ids(await prisma.stockMovement.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  WarehouseTransfer: async (ctx, projectId) =>
    ids(await prisma.warehouseTransfer.findMany({ where: projectCompanyWhere(ctx, projectId), ...entityIdPage })),
  DocumentAttachment: async (ctx, projectId) =>
    ids(await prisma.documentAttachment.findMany({ where: sharedProjectCompanyWhere(ctx, projectId), ...entityIdPage })),
  Schedule: async (ctx, projectId) =>
    ids(await prisma.schedule.findMany({ where: { tenantId: ctx.tenantId, projectId }, ...entityIdPage })),
};

async function resolveWbsAndCostItems(ctx: ServiceContext, projectId: string): Promise<string[]> {
  const budgets = await prisma.budget.findMany({
    where: sharedProjectCompanyWhere(ctx, projectId),
    ...entityIdPage,
  });
  if (budgets.length === 0) return [];

  const budgetIds = budgets.map((b) => b.id);
  const [wbsNodes, costItems, costLines] = await Promise.all([
    prisma.wbsNode.findMany({ where: { budgetId: { in: budgetIds } }, select: { id: true } }),
    prisma.costItem.findMany({ where: { budgetId: { in: budgetIds } }, select: { id: true } }),
    prisma.costAnalysisLine.findMany({
      where: { budgetId: { in: budgetIds } },
      select: { id: true },
    }),
  ]);

  return [
    ...wbsNodes.map((r) => r.id),
    ...costItems.map((r) => r.id),
    ...costLines.map((r) => r.id),
  ];
}

async function resolveCertificationLines(ctx: ServiceContext, projectId: string): Promise<string[]> {
  const certs = await prisma.certification.findMany({
    where: sharedProjectCompanyWhere(ctx, projectId),
    ...entityIdPage,
  });
  if (certs.length === 0) return [];
  const lines = await prisma.certificationLine.findMany({
    where: { certificationId: { in: certs.map((c) => c.id) } },
    select: { id: true },
  });
  return lines.map((l) => l.id);
}

async function resolveScheduleItems(ctx: ServiceContext, projectId: string): Promise<string[]> {
  const schedule = await prisma.schedule.findFirst({
    where: { tenantId: ctx.tenantId, projectId },
    select: { id: true },
  });
  if (!schedule) return [];
  const items = await prisma.scheduleItem.findMany({
    where: { scheduleId: schedule.id },
    select: { id: true },
  });
  return items.map((i) => i.id);
}

function ids(rows: { id: string }[]): string[] {
  return rows.map((r) => r.id);
}

/**
 * Resolves entity IDs scoped to a project for hybrid audit log filtering
 * (historical rows without denormalized projectId on audit_logs).
 */
export async function resolveEntityIdsForProject(
  ctx: ServiceContext,
  projectId: string,
  entityTypes: readonly string[],
): Promise<string[]> {
  const out = new Set<string>();
  const uniqueTypes = [...new Set(entityTypes)];
  let wbsResolved = false;
  let certLinesResolved = false;
  let scheduleItemsResolved = false;

  for (const entityType of uniqueTypes) {
    const direct = DIRECT_PROJECT_ID_RESOLVERS[entityType];
    if (direct) {
      for (const id of await direct(ctx, projectId)) out.add(id);
      continue;
    }
    if (
      !wbsResolved &&
      (entityType === "WbsNode" || entityType === "CostItem" || entityType === "CostAnalysisLine")
    ) {
      for (const id of await resolveWbsAndCostItems(ctx, projectId)) out.add(id);
      wbsResolved = true;
      continue;
    }
    if (!certLinesResolved && entityType === "CertificationLine") {
      for (const id of await resolveCertificationLines(ctx, projectId)) out.add(id);
      certLinesResolved = true;
      continue;
    }
    if (!scheduleItemsResolved && entityType === "ScheduleItem") {
      for (const id of await resolveScheduleItems(ctx, projectId)) out.add(id);
      scheduleItemsResolved = true;
    }
  }

  return [...out].slice(0, MAX_ENTITY_IDS);
}
