import { Prisma } from "@bloqer/database";
import { isCrossCompany } from "../company-scope";
import { requireProjectAccess } from "../security/access";
import { lockProjectForMutation } from "../project/project-write-lock";
import { lockProjectForOperationalMutation } from "../project/project-operational-guard";
import { ServiceError, type ServiceContext } from "../types";

export const subcontractWbsInclude = {
  budget: { select: { tenantId: true, companyId: true, projectId: true, status: true } },
  costItem: { select: { budgetId: true, unit: true } },
} as const satisfies Prisma.WbsNodeInclude;

export const subcontractLineInclude = {
  wbsNode: { include: subcontractWbsInclude },
} as const satisfies Prisma.SubcontractLineInclude;

export const subcontractParentsInclude = {
  company: { select: { id: true, tenantId: true } },
  project: { select: { id: true, tenantId: true, companyId: true } },
  subcontractorContact: {
    select: { id: true, tenantId: true, legalName: true, fantasyName: true },
  },
} as const satisfies Prisma.SubcontractInclude;

export const subcontractInclude = {
  ...subcontractParentsInclude,
  lines: { include: subcontractLineInclude, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
  certifications: {
    select: {
      id: true,
      tenantId: true,
      companyId: true,
      projectId: true,
      subcontractId: true,
      subcontractorContactId: true,
      status: true,
      lines: { select: { subcontractLineId: true, currentQty: true, lineTotal: true } },
    },
  },
} as const satisfies Prisma.SubcontractInclude;

export const subcontractCertificationInclude = {
  subcontract: { include: subcontractParentsInclude },
  replacedBy: {
    where: { status: { not: "CANCELLED" } },
    select: {
      id: true,
      tenantId: true,
      companyId: true,
      projectId: true,
      subcontractId: true,
      subcontractorContactId: true,
      number: true,
      replacesCertificationId: true,
    },
  },
  supplierInvoice: {
    select: {
      id: true,
      number: true,
      tenantId: true,
      companyId: true,
      projectId: true,
      supplierContactId: true,
      subcontractCertificationId: true,
      purchaseOrderId: true,
      status: true,
      documentKind: true,
    },
  },
  lines: {
    include: { subcontractLine: { include: subcontractLineInclude } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  },
} as const satisfies Prisma.SubcontractCertificationInclude;

export type SubcontractParents = Prisma.SubcontractGetPayload<{
  include: typeof subcontractParentsInclude;
}>;
export type SubcontractRecord = Prisma.SubcontractGetPayload<{
  include: typeof subcontractInclude;
}>;
export type SubcontractLineRecord = Prisma.SubcontractLineGetPayload<{
  include: typeof subcontractLineInclude;
}>;
export type SubcontractCertificationRecord = Prisma.SubcontractCertificationGetPayload<{
  include: typeof subcontractCertificationInclude;
}>;

function inconsistent(): never {
  throw new ServiceError(
    "CONFLICT",
    "Los vínculos del subcontrato son inconsistentes. Revisá el documento origen.",
  );
}

export function assertSubcontractWbsParent(
  node: Prisma.WbsNodeGetPayload<{ include: typeof subcontractWbsInclude }>,
  scope: { tenantId: string; companyId: string; projectId: string },
): void {
  if (
    node.budget.tenantId !== scope.tenantId ||
    node.budget.projectId !== scope.projectId ||
    (node.budget.companyId !== null && node.budget.companyId !== scope.companyId) ||
    node.type !== "ITEM" ||
    (node.costItem && node.costItem.budgetId !== node.budgetId)
  )
    inconsistent();
}

export function assertSubcontractParents(
  row: SubcontractParents & { certifications?: SubcontractRecord["certifications"] },
  lines: readonly SubcontractLineRecord[] = [],
): void {
  if (
    row.company.id !== row.companyId ||
    row.company.tenantId !== row.tenantId ||
    row.project.id !== row.projectId ||
    row.project.tenantId !== row.tenantId ||
    (row.project.companyId !== null && row.project.companyId !== row.companyId) ||
    row.subcontractorContact.id !== row.subcontractorContactId ||
    row.subcontractorContact.tenantId !== row.tenantId
  )
    inconsistent();
  for (const line of lines) {
    if (line.subcontractId !== row.id) inconsistent();
    if (line.wbsNode) assertSubcontractWbsParent(line.wbsNode, row);
  }
  if (row.certifications) {
    const ids = new Set(lines.map((line) => line.id)),
      approved = new Map<string, Prisma.Decimal>();
    for (const cert of row.certifications) {
      if (
        cert.subcontractId !== row.id ||
        cert.tenantId !== row.tenantId ||
        cert.companyId !== row.companyId ||
        cert.projectId !== row.projectId ||
        cert.subcontractorContactId !== row.subcontractorContactId ||
        cert.lines.some((line) => !ids.has(line.subcontractLineId))
      )
        inconsistent();
      if (cert.status === "APPROVED")
        for (const line of cert.lines)
          approved.set(
            line.subcontractLineId,
            (approved.get(line.subcontractLineId) ?? new Prisma.Decimal(0)).plus(line.currentQty),
          );
    }
    if (
      lines.some(
        (line) => !line.certifiedQuantity.equals(approved.get(line.id) ?? new Prisma.Decimal(0)),
      )
    )
      throw new ServiceError(
        "CONFLICT",
        "Las cantidades certificadas no coinciden con sus documentos vigentes. Revisá las certificaciones antes de continuar.",
      );
  }
}

export function assertSubcontractCertificationParents(row: SubcontractCertificationRecord): void {
  if (
    row.tenantId !== row.subcontract.tenantId ||
    row.companyId !== row.subcontract.companyId ||
    row.projectId !== row.subcontract.projectId ||
    row.subcontractorContactId !== row.subcontract.subcontractorContactId
  )
    inconsistent();
  assertSubcontractParents(
    row.subcontract,
    row.lines.map((line) => line.subcontractLine),
  );
  if (row.lines.some((line) => line.subcontractCertificationId !== row.id)) inconsistent();
  if (
    row.replacedBy.length > 1 ||
    row.replacedBy.some(
      (next) =>
        row.status !== "REJECTED" ||
        next.replacesCertificationId !== row.id ||
        next.tenantId !== row.tenantId ||
        next.companyId !== row.companyId ||
        next.projectId !== row.projectId ||
        next.subcontractId !== row.subcontractId ||
        next.subcontractorContactId !== row.subcontractorContactId,
    )
  )
    inconsistent();
  const invoice = row.supplierInvoice;
  if (
    invoice &&
    ((row.status !== "APPROVED" && row.status !== "CANCELLED") ||
      (row.status === "CANCELLED" && invoice.status !== "CANCELLED"))
  )
    inconsistent();
  if (
    invoice &&
    (invoice.tenantId !== row.tenantId ||
      invoice.companyId !== row.companyId ||
      invoice.projectId !== row.projectId ||
      invoice.supplierContactId !== row.subcontractorContactId ||
      invoice.subcontractCertificationId !== row.id ||
      invoice.purchaseOrderId !== null ||
      invoice.documentKind !== "INVOICE")
  )
    inconsistent();
}

export async function assertSubcontractAccess(
  row: { tenantId: string; companyId: string; projectId: string },
  ctx: ServiceContext,
): Promise<void> {
  if (row.tenantId !== ctx.tenantId || isCrossCompany(row.companyId, ctx))
    throw new ServiceError("FORBIDDEN", "El subcontrato no pertenece al contexto autorizado");
  await requireProjectAccess(row.projectId, ctx);
}

/** Shared with AP's Project-first locks; no effect may run on a stale preview. */
export async function lockSubcontractMutation(
  tx: Prisma.TransactionClient,
  preview: { id: string; companyId: string; projectId: string },
  ctx: ServiceContext,
  options: { reversal?: boolean } = {},
): Promise<SubcontractRecord> {
  const project = options.reversal
    ? await lockProjectForMutation(tx, preview.projectId, ctx.tenantId)
    : await lockProjectForOperationalMutation(tx, preview.projectId, ctx);
  if (isCrossCompany(project.companyId, ctx))
    throw new ServiceError("FORBIDDEN", "La obra cambió de contexto");
  const setting = await tx.tenantModuleSetting.findFirst({
    where: { tenantId: ctx.tenantId, moduleKey: "SUBCONTRACTS" },
    select: { isEnabled: true },
  });
  if (setting?.isEnabled === false)
    throw new ServiceError("FORBIDDEN", "El módulo Subcontratos está deshabilitado");
  await tx.$queryRaw`SELECT id FROM companies WHERE id = ${preview.companyId} AND "tenantId" = ${ctx.tenantId} FOR NO KEY UPDATE`;
  await tx.$queryRaw`SELECT id FROM subcontracts WHERE id = ${preview.id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
  const row = await tx.subcontract.findFirst({
    where: { id: preview.id, tenantId: ctx.tenantId },
    include: subcontractInclude,
  });
  if (
    !row ||
    row.companyId !== preview.companyId ||
    row.projectId !== preview.projectId ||
    isCrossCompany(row.companyId, ctx)
  )
    throw new ServiceError("CONFLICT", "El subcontrato cambió. Recargá e intentá de nuevo.");
  assertSubcontractParents(row, row.lines);
  return row;
}
