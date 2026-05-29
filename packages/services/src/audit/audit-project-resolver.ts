import { prisma } from "@bloqer/database";

const MAX_ENTITY_IDS = 5000;

type Resolver = (tenantId: string, projectId: string) => Promise<string[]>;

const DIRECT_PROJECT_ID_RESOLVERS: Record<string, Resolver> = {
  Project: async (_tenantId, projectId) => [projectId],
  PurchaseOrder: async (tenantId, projectId) =>
    ids(await prisma.purchaseOrder.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  PurchaseReceipt: async (tenantId, projectId) =>
    ids(await prisma.purchaseReceipt.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  Payment: async (tenantId, projectId) =>
    ids(await prisma.payment.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  Budget: async (tenantId, projectId) =>
    ids(await prisma.budget.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  Certification: async (tenantId, projectId) =>
    ids(await prisma.certification.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  SalesInvoice: async (tenantId, projectId) =>
    ids(await prisma.salesInvoice.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  Receivable: async (tenantId, projectId) =>
    ids(await prisma.receivable.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  Collection: async (tenantId, projectId) =>
    ids(await prisma.collection.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  SupplierInvoice: async (tenantId, projectId) =>
    ids(await prisma.supplierInvoice.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  Payable: async (tenantId, projectId) =>
    ids(await prisma.payable.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  AccountMovement: async (tenantId, projectId) =>
    ids(await prisma.accountMovement.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  JournalEntry: async (tenantId, projectId) =>
    ids(await prisma.journalEntry.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  Subcontract: async (tenantId, projectId) =>
    ids(await prisma.subcontract.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  SubcontractCertification: async (tenantId, projectId) =>
    ids(await prisma.subcontractCertification.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  JobsiteLog: async (tenantId, projectId) =>
    ids(await prisma.jobsiteLog.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  Warehouse: async (tenantId, projectId) =>
    ids(await prisma.warehouse.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  StockMovement: async (tenantId, projectId) =>
    ids(await prisma.stockMovement.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  WarehouseTransfer: async (tenantId, projectId) =>
    ids(await prisma.warehouseTransfer.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  DocumentAttachment: async (tenantId, projectId) =>
    ids(await prisma.documentAttachment.findMany({ where: { tenantId, projectId }, select: { id: true } })),
  Schedule: async (tenantId, projectId) =>
    ids(await prisma.schedule.findMany({ where: { tenantId, projectId }, select: { id: true } })),
};

async function resolveWbsAndCostItems(tenantId: string, projectId: string): Promise<string[]> {
  const budgets = await prisma.budget.findMany({
    where: { tenantId, projectId },
    select: { id: true },
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

async function resolveCertificationLines(tenantId: string, projectId: string): Promise<string[]> {
  const certs = await prisma.certification.findMany({
    where: { tenantId, projectId },
    select: { id: true },
  });
  if (certs.length === 0) return [];
  const lines = await prisma.certificationLine.findMany({
    where: { certificationId: { in: certs.map((c) => c.id) } },
    select: { id: true },
  });
  return lines.map((l) => l.id);
}

async function resolveScheduleItems(tenantId: string, projectId: string): Promise<string[]> {
  const schedule = await prisma.schedule.findFirst({
    where: { tenantId, projectId },
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
  tenantId: string,
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
      for (const id of await direct(tenantId, projectId)) out.add(id);
      continue;
    }
    if (
      !wbsResolved &&
      (entityType === "WbsNode" || entityType === "CostItem" || entityType === "CostAnalysisLine")
    ) {
      for (const id of await resolveWbsAndCostItems(tenantId, projectId)) out.add(id);
      wbsResolved = true;
      continue;
    }
    if (!certLinesResolved && entityType === "CertificationLine") {
      for (const id of await resolveCertificationLines(tenantId, projectId)) out.add(id);
      certLinesResolved = true;
      continue;
    }
    if (!scheduleItemsResolved && entityType === "ScheduleItem") {
      for (const id of await resolveScheduleItems(tenantId, projectId)) out.add(id);
      scheduleItemsResolved = true;
    }
  }

  return [...out].slice(0, MAX_ENTITY_IDS);
}
