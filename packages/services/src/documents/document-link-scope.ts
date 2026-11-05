import { prisma } from "@bloqer/database";
import type { LinkedEntityType } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { canMutateApForScope, canViewApProjectArea, canViewCompanyAp } from "../ap/ap-access";
import { canMutateArForScope, canViewArProjectArea, canViewCompanyAr } from "../ar/ar-access";
import { isCrossCompany } from "../company-scope";
import { canMutateJobsiteLogAsContributor, canViewJobsiteLogArea } from "../jobsite-log/jobsite-log-access";
import {
  canEditPurchaseOrders,
  canEditPurchaseReceipts,
  canEditPurchaseRequests,
  canViewProcurementProjectArea,
  canViewPurchaseRequests,
} from "../procurement/procurement-access";
import { canViewBudgetsArea } from "../project/project-nav-guards";
import { canViewProjectDocuments, requireProjectAccess } from "../security/access";
import { canEditSubcontractsArea, canViewSubcontractsArea } from "../subcontracts/subcontract-access";
import { ServiceError, type ServiceContext } from "../types";

type Roles = ServiceContext["roles"];
type LinkType = LinkedEntityType | null;

export function isDocumentOperationalLink(type: string): type is Exclude<LinkedEntityType, "PROJECT" | "WAREHOUSE_TRANSFER" | "SCHEDULED_REPORT" | "OTHER"> {
  return [
    "BUDGET", "JOBSITE_LOG", "CERTIFICATION", "SUPPLIER_INVOICE", "SALES_INVOICE",
    "PURCHASE_ORDER", "PURCHASE_RECEIPT", "PURCHASE_REQUEST", "PROCUREMENT_QUOTE",
    "SUBCONTRACT", "SUBCONTRACT_CERTIFICATION",
  ].includes(type);
}

export function canViewDocumentByLink(type: LinkType, roles: Roles, projectId: string | null): boolean {
  switch (type) {
    case null:
    case "PROJECT": return projectId !== null && canViewProjectDocuments(roles);
    case "JOBSITE_LOG": return canViewJobsiteLogArea(roles);
    case "CERTIFICATION": return can(roles, "VIEW", "CERTIFICATIONS");
    case "SUPPLIER_INVOICE": return projectId === null ? canViewCompanyAp(roles) : canViewApProjectArea(roles);
    case "SALES_INVOICE": return projectId === null ? canViewCompanyAr(roles) : canViewArProjectArea(roles);
    case "PURCHASE_ORDER":
    case "PURCHASE_RECEIPT": return canViewProcurementProjectArea(roles);
    case "PURCHASE_REQUEST":
    case "PROCUREMENT_QUOTE": return canViewPurchaseRequests(roles);
    case "SUBCONTRACT":
    case "SUBCONTRACT_CERTIFICATION": return canViewSubcontractsArea(roles);
    case "BUDGET": return canViewBudgetsArea(roles);
    default: return false;
  }
}

export function canMutateDocumentByLink(type: LinkType, roles: Roles, projectId: string | null): boolean {
  switch (type) {
    case null:
    case "PROJECT": return projectId !== null && can(roles, "EDIT", "PROJECTS");
    case "JOBSITE_LOG": return canMutateJobsiteLogAsContributor(roles);
    case "CERTIFICATION": return can(roles, "EDIT", "CERTIFICATIONS");
    case "SUPPLIER_INVOICE": return canMutateApForScope(roles, projectId);
    case "SALES_INVOICE": return canMutateArForScope(roles, projectId);
    case "PURCHASE_ORDER":
    case "PROCUREMENT_QUOTE": return canEditPurchaseOrders(roles);
    case "PURCHASE_RECEIPT": return canEditPurchaseReceipts(roles);
    case "PURCHASE_REQUEST": return canEditPurchaseRequests(roles);
    case "SUBCONTRACT":
    case "SUBCONTRACT_CERTIFICATION": return canEditSubcontractsArea(roles);
    case "BUDGET": return can(roles, "EDIT", "BUDGETS");
    default: return false;
  }
}

export type DocumentLinkScope = { tenantId: string; projectId: string | null; companyId: string | null };
type DocumentLink = DocumentLinkScope & { linkedEntityType: LinkType; linkedEntityId: string | null; folderId?: string | null };
type DocumentProject = { id: string; tenantId: string; companyId: string | null };
const scopeSelect = { tenantId: true, projectId: true, companyId: true } as const;
const parentSelect = { id: true, ...scopeSelect } as const;

/** Each non-null company anchor must agree. Null anchors remain shared. */
function mergeScope(scope: DocumentLinkScope, other: DocumentLinkScope | null): DocumentLinkScope | null {
  if (other === null) return scope;
  if (scope.tenantId !== other.tenantId || scope.projectId !== other.projectId ||
      (scope.companyId !== null && other.companyId !== null && scope.companyId !== other.companyId)) {
    return null;
  }
  return { ...scope, companyId: scope.companyId ?? other.companyId };
}

type ParentRow = { id: string } & DocumentLinkScope;

function collectValidParents<T extends ParentRow>(
  rows: T[],
  related: (row: T) => Array<DocumentLinkScope | null>,
): ParentRow[] {
  return rows.flatMap((row) => {
    const scope = related(row).reduce<DocumentLinkScope | null>(
      (current, parent) => current && mergeScope(current, parent), row,
    );
    return scope === null ? [] : [{ ...scope, id: row.id }];
  });
}

async function loadDocumentParents(type: LinkedEntityType, ids: string[], tenantId: string): Promise<ParentRow[]> {
  const where = { tenantId, id: { in: ids } };
  const select = parentSelect;
  switch (type) {
    case "BUDGET": return prisma.budget.findMany({ where, select });
    case "JOBSITE_LOG": return prisma.jobsiteLog.findMany({ where, select });
    case "CERTIFICATION":
      return collectValidParents(await prisma.certification.findMany({
        where, select: { ...select, budget: { select: scopeSelect } },
      }), (row) => [row.budget]);
    case "SUPPLIER_INVOICE":
      return collectValidParents(await prisma.supplierInvoice.findMany({
        where, select: {
          ...select, purchaseOrder: { select: scopeSelect }, subcontractCertification: { select: scopeSelect },
        },
      }), (row) => [row.purchaseOrder, row.subcontractCertification]);
    case "SALES_INVOICE":
      return collectValidParents(await prisma.salesInvoice.findMany({
        where, select: { ...select, certification: { select: scopeSelect } },
      }), (row) => [row.certification]);
    case "PURCHASE_ORDER":
      return collectValidParents(await prisma.purchaseOrder.findMany({
        where, select: { ...select, purchaseRequest: { select: scopeSelect } },
      }), (row) => [row.purchaseRequest]);
    case "PURCHASE_RECEIPT":
      return collectValidParents(await prisma.purchaseReceipt.findMany({
        where, select: { ...select, purchaseOrder: { select: scopeSelect } },
      }), (row) => [row.purchaseOrder]);
    case "PURCHASE_REQUEST": return prisma.purchaseRequest.findMany({ where, select });
    case "PROCUREMENT_QUOTE": {
      const quotes = await prisma.procurementQuote.findMany({
        where, select: { id: true, tenantId: true, purchaseRequest: { select: scopeSelect } },
      });
      return quotes.flatMap((quote) => quote.tenantId === quote.purchaseRequest.tenantId
        ? [{ ...quote.purchaseRequest, id: quote.id }]
        : []);
    }
    case "SUBCONTRACT": return prisma.subcontract.findMany({ where, select });
    case "SUBCONTRACT_CERTIFICATION":
      return collectValidParents(await prisma.subcontractCertification.findMany({
        where, select: { ...select, subcontract: { select: scopeSelect } },
      }), (row) => [row.subcontract]);
    default: return [];
  }
}

export async function requireDocumentParent(type: LinkedEntityType, id: string, ctx: ServiceContext): Promise<DocumentLinkScope> {
  const [parent] = await loadDocumentParents(type, [id], ctx.tenantId);
  if (!parent) throw new ServiceError("NOT_FOUND", "Entidad del adjunto no encontrada");
  if (isCrossCompany(parent.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La entidad del adjunto no pertenece a la empresa activa");
  }
  return parent;
}

export async function assertDocumentCompanyInTenant(companyId: string | null, tenantId: string): Promise<void> {
  if (companyId === null) return;
  const company = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true } });
  if (!company) throw new ServiceError("NOT_FOUND", "Empresa del documento no encontrada");
}

export function documentScopeInProject(parent: DocumentLinkScope, project: DocumentProject): DocumentLinkScope | null {
  return mergeScope(parent, { ...project, projectId: project.id });
}

export function documentMatchesScope(doc: DocumentLinkScope, target: DocumentLinkScope, ctx: ServiceContext): boolean {
  const scope = mergeScope(doc, target);
  return scope !== null && scope.tenantId === ctx.tenantId && !isCrossCompany(scope.companyId, ctx);
}

/** Enforce the same parent before signing bytes, returning metadata, or mutating by UUID. */
export async function requireDocumentLinkAccess(doc: DocumentLink, ctx: ServiceContext): Promise<string | null> {
  const project = doc.projectId ? await requireProjectAccess(doc.projectId, ctx) : null;
  let parent: DocumentLinkScope | null;
  if (doc.linkedEntityType === null || doc.linkedEntityType === "PROJECT") {
    parent = project && (doc.linkedEntityId === project.id ||
      (doc.linkedEntityType === null && doc.linkedEntityId === null))
      ? { ...project, projectId: project.id } : null;
  } else {
    parent = doc.linkedEntityId ? await requireDocumentParent(doc.linkedEntityType, doc.linkedEntityId, ctx) : null;
    if (parent && project) parent = documentScopeInProject(parent, project);
  }
  const scope = parent && mergeScope(doc, parent);
  if (!scope || scope.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Documento no encontrado");
  }
  if (isCrossCompany(scope.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "El documento no pertenece a la empresa activa");
  }
  await assertDocumentCompanyInTenant(scope.companyId, ctx.tenantId);
  if (doc.folderId) {
    const folder = doc.projectId && await prisma.documentFolder.findFirst({
      where: { id: doc.folderId, tenantId: ctx.tenantId, projectId: doc.projectId }, select: { id: true },
    });
    if (!folder) throw new ServiceError("NOT_FOUND", "Carpeta del documento no encontrada");
  }
  return scope.companyId;
}

/** Resolve scope evidence in batches. The caller applies its own access rules. */
export async function resolveDocumentLinkScopes<T extends DocumentLink>(
  documents: T[],
  projects: DocumentProject[],
  tenantId: string,
): Promise<Array<{ doc: T; scope: DocumentLinkScope }>> {
  const projectById = new Map(projects.filter((project) => project.tenantId === tenantId)
    .map((project) => [project.id, project]));
  const tenantDocuments = documents.filter((doc) => doc.tenantId === tenantId);
  const idsByType = new Map<LinkedEntityType, Set<string>>();
  for (const { linkedEntityType: type, linkedEntityId: id } of tenantDocuments) {
    if (!type || type === "PROJECT" || !id) continue;
    if (!idsByType.has(type)) idsByType.set(type, new Set());
    idsByType.get(type)!.add(id);
  }
  const parents = new Map(await Promise.all([...idsByType].map(async ([type, ids]) => [
    type, new Map((await loadDocumentParents(type, [...ids], tenantId)).map((row) => [row.id, row])),
  ] as const)));
  const scoped = tenantDocuments.flatMap((doc) => {
    const project = doc.projectId ? projectById.get(doc.projectId) : undefined;
    if (doc.projectId && !project) return [];
    const type = doc.linkedEntityType;
    let target: DocumentLinkScope | null | undefined;
    if (type === null || type === "PROJECT") {
      if (project && (doc.linkedEntityId === project.id || (type === null && doc.linkedEntityId === null))) {
        target = { ...project, projectId: project.id };
      }
    } else {
      const parent = doc.linkedEntityId ? parents.get(type)?.get(doc.linkedEntityId) : undefined;
      if (parent) target = project ? documentScopeInProject(parent, project) : parent;
    }
    const scope = target && mergeScope(doc, target);
    return scope ? [{ doc, scope }] : [];
  });
  const companyIds = [...new Set(scoped.flatMap(({ scope }) => scope.companyId ? [scope.companyId] : []))];
  const companies = companyIds.length === 0 ? [] : await prisma.company.findMany({
    where: { tenantId, id: { in: companyIds } }, select: { id: true },
  });
  const validCompanies = new Set(companies.map(({ id }) => id));
  return scoped.filter(({ scope }) => scope.companyId === null || validCompanies.has(scope.companyId));
}

export async function filterProjectDocumentsByLink<T extends DocumentLink>(
  documents: T[],
  project: DocumentProject,
  ctx: ServiceContext,
): Promise<T[]> {
  const readable = documents.filter((doc) => doc.projectId === project.id &&
    canViewDocumentByLink(doc.linkedEntityType, ctx.roles, doc.projectId));
  const scoped = await resolveDocumentLinkScopes(readable, [project], ctx.tenantId);
  return scoped.filter(({ scope }) => !isCrossCompany(scope.companyId, ctx)).map(({ doc }) => doc);
}
