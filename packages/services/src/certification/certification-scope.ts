import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { companyScopeFilter, isCrossCompany } from "../company-scope";
import { requireProjectAccess } from "../security/access";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";
import { ServiceError, type ServiceContext } from "../types";

const companyParent = { select: { id: true, tenantId: true } } as const;
export const certificationBudgetSelect = {
  id: true,
  tenantId: true,
  companyId: true,
  projectId: true,
  status: true,
  currency: true,
  company: companyParent,
} as const satisfies Prisma.BudgetSelect;
export const certificationInclude = {
  company: companyParent,
  project: {
    select: {
      id: true,
      tenantId: true,
      companyId: true,
      clientContactId: true,
      company: companyParent,
    },
  },
  budget: { select: certificationBudgetSelect },
  lines: {
    include: { wbsNode: { include: { costItem: true } } },
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
  },
} as const satisfies Prisma.CertificationInclude;
export type CertificationRecord = Prisma.CertificationGetPayload<{
  include: typeof certificationInclude;
}>;
export type CertificationDatabase = Pick<Prisma.TransactionClient, "certification">;

export async function authorizeCertification(
  ctx: ServiceContext,
  action: "VIEW" | "EDIT" | "APPROVE",
) {
  await assertTenantModuleEnabled(ctx, "CERTIFICATIONS");
  if (!can(ctx.roles, action, "CERTIFICATIONS"))
    throw new ServiceError("FORBIDDEN", "Sin permisos para operar certificaciones");
}

function relationConflict(): never {
  throw new ServiceError(
    "CONFLICT",
    "Las relaciones de la certificación son inconsistentes. Revisá el presupuesto y sus partidas.",
  );
}

export function assertCertificationBudget(
  budget: Pick<CertificationRecord["budget"], "tenantId" | "projectId" | "companyId" | "company">,
  project: Pick<CertificationRecord["project"], "id" | "tenantId" | "companyId">,
  companyId: string | null,
  ctx: ServiceContext,
) {
  if (
    budget.tenantId !== ctx.tenantId ||
    project.tenantId !== ctx.tenantId ||
    budget.projectId !== project.id
  )
    relationConflict();
  if (budget.company && budget.company.tenantId !== ctx.tenantId) relationConflict();
  if (isCrossCompany(budget.companyId, ctx) || isCrossCompany(project.companyId, ctx))
    throw new ServiceError("FORBIDDEN", "El presupuesto no pertenece a la empresa activa");
  const companies = [companyId, budget.companyId, project.companyId].filter(
    (id): id is string => id !== null,
  );
  if (new Set(companies).size > 1) relationConflict();
}

export function assertCertificationNode(
  node: {
    id: string;
    type: string;
    budgetId: string;
    costItem: { budgetId: string; wbsNodeId: string } | null;
  },
  budgetId: string,
) {
  if (
    node.budgetId !== budgetId ||
    node.type !== "ITEM" ||
    !node.costItem ||
    node.costItem.budgetId !== budgetId ||
    node.costItem.wbsNodeId !== node.id
  )
    relationConflict();
}

export function assertCertificationRelations(cert: CertificationRecord, ctx: ServiceContext) {
  if (cert.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Acceso a otra organización denegado");
  if (isCrossCompany(cert.companyId, ctx))
    throw new ServiceError("FORBIDDEN", "La certificación no pertenece a la empresa activa");
  if (cert.company && cert.company.tenantId !== ctx.tenantId) relationConflict();
  if (
    cert.project.id !== cert.projectId ||
    cert.budget.id !== cert.budgetId ||
    (cert.project.company && cert.project.company.tenantId !== ctx.tenantId)
  )
    relationConflict();
  assertCertificationBudget(cert.budget, cert.project, cert.companyId, ctx);
  for (const line of cert.lines) {
    if (line.certificationId !== cert.id || line.wbsNodeId !== line.wbsNode.id) relationConflict();
    assertCertificationNode(line.wbsNode, cert.budgetId);
  }
}

export async function loadCertificationRecord(
  id: string,
  ctx: ServiceContext,
  db: CertificationDatabase = prisma,
) {
  const cert = await db.certification.findUnique({ where: { id }, include: certificationInclude });
  if (!cert) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  assertCertificationRelations(cert, ctx);
  return cert;
}

export async function requireCertificationAccess(id: string, ctx: ServiceContext) {
  const cert = await loadCertificationRecord(id, ctx);
  await requireProjectAccess(cert.projectId, ctx);
  return cert;
}

export function certificationWhere(ctx: ServiceContext): Prisma.CertificationWhereInput {
  return { tenantId: ctx.tenantId, ...companyScopeFilter(ctx) };
}

export function assertCertificationBudgetActive(status: string) {
  if (status !== "APPROVED" && status !== "CLOSED")
    throw new ServiceError(
      "CONFLICT",
      "Solo se puede certificar contra presupuestos aprobados o cerrados (BR-CERT-001)",
    );
}
