import { prisma } from "@bloqer/database";
import { isUuid } from "@bloqer/utils";
import { isCrossCompany } from "../company-scope";
import { resolveDocumentLinkScopes } from "../documents/document-link-scope";
import { resolveAccessibleProjectScope } from "../security/access";
import type { ServiceContext } from "../types";

type LegacyRow = {
  id: string;
  entityType: string;
  action: string;
  entityId: string;
  companyId: string | null;
  projectId: string | null;
  before: unknown;
  after: unknown;
};

type ScopeEvidence = {
  id: string;
  tenantId?: string;
  companyId?: string | null;
  projectId?: string | null;
};

const companySelect = { id: true, companyId: true } as const;
const projectSelect = { id: true, projectId: true } as const;
const scopeSelect = { ...companySelect, ...projectSelect } as const;
const parentSelect = { tenantId: true, companyId: true, projectId: true } as const;
type Lookup = (where: { id: { in: string[] }; tenantId: string }) => Promise<ScopeEvidence[]>;

/** Only relationships that can prove the scope of the underlying entity. */
const LEGACY_ENTITY_LOOKUPS: Readonly<Partial<Record<string, Lookup>>> = {
  Project: (where) => prisma.project.findMany({ where, select: companySelect }),
  ProjectMembership: (where) => prisma.projectMembership.findMany({ where, select: projectSelect }),
  ProjectTeamMember: (where) => prisma.projectTeamMember.findMany({ where, select: projectSelect }),
  PurchaseRequest: (where) => prisma.purchaseRequest.findMany({ where, select: scopeSelect }),
  PurchaseOrder: (where) => prisma.purchaseOrder.findMany({ where, select: scopeSelect }),
  PurchaseReceipt: (where) => prisma.purchaseReceipt.findMany({ where, select: scopeSelect }),
  ProcurementQuote: async (where) => (await prisma.procurementQuote.findMany({
    where, select: { id: true, purchaseRequest: { select: parentSelect } },
  })).map(({ id, purchaseRequest }) => ({ id, ...purchaseRequest })),
  SupplierInvoice: (where) => prisma.supplierInvoice.findMany({ where, select: scopeSelect }),
  Payable: (where) => prisma.payable.findMany({ where, select: scopeSelect }),
  Payment: (where) => prisma.payment.findMany({ where, select: scopeSelect }),
  SalesInvoice: (where) => prisma.salesInvoice.findMany({ where, select: scopeSelect }),
  Receivable: (where) => prisma.receivable.findMany({ where, select: scopeSelect }),
  Collection: (where) => prisma.collection.findMany({ where, select: scopeSelect }),
  Budget: (where) => prisma.budget.findMany({ where, select: scopeSelect }),
  Certification: (where) => prisma.certification.findMany({ where, select: scopeSelect }),
  Subcontract: (where) => prisma.subcontract.findMany({ where, select: scopeSelect }),
  SubcontractCertification: (where) => prisma.subcontractCertification.findMany({ where, select: scopeSelect }),
  JobsiteLog: (where) => prisma.jobsiteLog.findMany({ where, select: scopeSelect }),
  Product: (where) => prisma.product.findMany({ where, select: companySelect }),
  Warehouse: (where) => prisma.warehouse.findMany({ where, select: scopeSelect }),
  StockMovement: (where) => prisma.stockMovement.findMany({ where, select: scopeSelect }),
  WarehouseTransfer: (where) => prisma.warehouseTransfer.findMany({ where, select: scopeSelect }),
  AccountingAccount: (where) => prisma.accountingAccount.findMany({ where, select: companySelect }),
  AccountingMappingRule: (where) => prisma.accountingMappingRule.findMany({ where, select: companySelect }),
  JournalEntry: (where) => prisma.journalEntry.findMany({ where, select: scopeSelect }),
  Period: (where) => prisma.period.findMany({ where, select: companySelect }),
  Schedule: (where) => prisma.schedule.findMany({ where, select: projectSelect }),
  DocumentFolder: (where) => prisma.documentFolder.findMany({ where, select: projectSelect }),
  DocumentAttachment: async (where) => {
    const documents = await prisma.documentAttachment.findMany({
      where,
      select: {
        ...scopeSelect, tenantId: true, linkedEntityType: true, linkedEntityId: true,
        project: { select: { ...companySelect, tenantId: true } },
      },
    });
    const projects = documents.flatMap(({ project }) => project ? [project] : []);
    const scoped = await resolveDocumentLinkScopes(documents, projects, where.tenantId);
    return scoped.map(({ doc, scope }) => ({ id: doc.id, ...scope }));
  },
};

function snapshotScope(row: LegacyRow, key: "companyId" | "projectId"): (string | null)[] {
  return [row.before, row.after].flatMap((payload) => {
    if (!payload || typeof payload !== "object" || !Object.hasOwn(payload, key)) return [];
    const value: unknown = (payload as Record<string, unknown>)[key];
    return value === null || typeof value === "string" ? [value] : [];
  });
}

const SHARED_SNAPSHOT_TYPES = new Set([
  "Project", "Budget", "Certification", "Product", "UserMembership", "TenantInvitation",
]);

function needsLegacyEvidence(row: LegacyRow): boolean {
  return row.companyId === null && (
    Object.hasOwn(LEGACY_ENTITY_LOOKUPS, row.entityType) ||
    row.entityType === "Company" ||
    row.entityType === "UserMembership" ||
    row.entityType === "TenantInvitation" ||
    row.entityType === "CompanyProcurementSettings" ||
    row.action === "project_membership.user_set" ||
    row.entityType === "BudgetSettings" ||
    row.entityType === "WbsNode" ||
    row.entityType === "CostItem" ||
    row.entityType === "CostAnalysisLine" ||
    row.entityType === "CertificationLine" ||
    row.entityType === "ScheduleItem"
  );
}

function canProveHistoricalProjectAssignments(after: unknown, accessible: ReadonlySet<string>): boolean {
  if (!after || typeof after !== "object") return false;
  const payload = after as Record<string, unknown>;
  const ids: unknown[] = [];
  for (const key of ["addedProjectIds", "removedProjectIds"] as const) {
    const value = payload[key];
    if (Array.isArray(value)) ids.push(...value);
    else if (typeof value === "string") ids.push(...(value ? value.split(",") : []));
    else return false;
  }
  return ids.length > 0 && ids.every((id) => typeof id === "string" && isUuid(id) && accessible.has(id));
}

async function loadLegacyEvidence(entityType: string, ids: string[], tenantId: string): Promise<ScopeEvidence[]> {
  const where = { id: { in: ids }, tenantId };
  if (Object.hasOwn(LEGACY_ENTITY_LOOKUPS, entityType)) {
    return LEGACY_ENTITY_LOOKUPS[entityType]!(where);
  }
  const budget = { select: parentSelect };
  const children = { where: { id: { in: ids }, budget: { tenantId } }, select: { id: true, budget } };
  switch (entityType) {
    case "BudgetSettings":
      return (await prisma.budgetSettings.findMany(children)).map((row) => ({ id: row.id, ...row.budget }));
    case "CompanyProcurementSettings":
      return prisma.companyProcurementSettings.findMany({
        where: { id: { in: ids }, company: { tenantId } }, select: companySelect,
      });
    case "WbsNode":
      return (await prisma.wbsNode.findMany(children)).map((row) => ({ id: row.id, ...row.budget }));
    case "CostItem":
      return (await prisma.costItem.findMany(children)).map((row) => ({ id: row.id, ...row.budget }));
    case "CostAnalysisLine":
      return (await prisma.costAnalysisLine.findMany(children)).map((row) => ({ id: row.id, ...row.budget }));
    case "CertificationLine":
      return (await prisma.certificationLine.findMany({
        where: { id: { in: ids }, certification: { tenantId } },
        select: { id: true, certification: { select: parentSelect } },
      })).map((row) => ({ id: row.id, ...row.certification }));
    case "ScheduleItem":
      return (await prisma.scheduleItem.findMany({
        where: { id: { in: ids }, schedule: { tenantId } },
        select: { id: true, schedule: { select: { tenantId: true, projectId: true } } },
      })).map((row) => ({ id: row.id, ...row.schedule }));
    default:
      return [];
  }
}

/** D-144. Resolve bounded candidate batches without reassigning historical membership events. */
export async function filterAuditLegacyScope<T extends LegacyRow>(
  rows: T[],
  ctx: ServiceContext,
): Promise<T[]> {
  if (!ctx.companyId) return rows;
  const candidates = rows.filter(needsLegacyEvidence);
  if (!candidates.length) return rows;

  const groups = new Map<string, string[]>();
  for (const row of candidates) {
    if (row.entityType === "Company" || row.entityType === "UserMembership" ||
      row.entityType === "TenantInvitation" || row.action === "project_membership.user_set") continue;
    const group = groups.get(row.entityType) ?? [];
    group.push(row.entityId);
    groups.set(row.entityType, group);
  }
  const [scope, evidence] = await Promise.all([
    resolveAccessibleProjectScope(ctx),
    Promise.all([...groups].map(async ([kind, ids]) => [kind, new Map(
      (await loadLegacyEvidence(kind, [...new Set(ids)], ctx.tenantId)).map((row) => [row.id, row]),
    )] as const)),
  ]);
  const byType = new Map(evidence);
  const accessible = scope === "ALL" ? null : new Set(scope.projectIds);
  const denied = new Set<string>();
  for (const row of candidates) {
    if (row.entityType === "Company") {
      if (row.entityId !== ctx.companyId) denied.add(row.id);
      continue;
    }
    if (row.action === "project_membership.user_set") {
      if (!accessible || !canProveHistoricalProjectAssignments(row.after, accessible)) denied.add(row.id);
      continue;
    }

    const snapshots = snapshotScope(row, "companyId");
    const snapshotProjects = snapshotScope(row, "projectId");
    const entity = byType.get(row.entityType)?.get(row.entityId);
    if (row.entityType === "DocumentAttachment" && (!entity ||
      [row.projectId, ...snapshotProjects].some((id) => id !== null && id !== entity.projectId))) {
      denied.add(row.id);
      continue;
    }
    const projectId = row.entityType === "Project" ? row.entityId : entity?.projectId;
    const outsideProject = accessible && [projectId, ...snapshotProjects].some((id) => id && !accessible.has(id));
    const wrongProject = row.projectId && projectId && row.projectId !== projectId;
    const outsideCompany = entity?.companyId !== undefined && isCrossCompany(entity.companyId, ctx);
    const outsideSnapshot = snapshots.some((companyId) => isCrossCompany(companyId, ctx));
    const hasSnapshot = snapshots.some((companyId) => companyId === ctx.companyId ||
      (companyId === null && SHARED_SNAPSHOT_TYPES.has(row.entityType)));
    if (
      (!entity && !hasSnapshot) || outsideSnapshot || outsideCompany || outsideProject ||
      wrongProject || (entity?.tenantId && entity.tenantId !== ctx.tenantId)
    ) {
      denied.add(row.id);
    }
  }
  return rows.filter((row) => !denied.has(row.id));
}
