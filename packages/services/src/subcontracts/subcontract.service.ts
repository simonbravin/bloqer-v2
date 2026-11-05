import { Prisma, prisma, type Subcontract } from "@bloqer/database";
import {
  createSubcontractSchema,
  updateSubcontractSchema,
  updateSubcontractMetaSchema,
  cancelSubcontractSchema,
  type CreateSubcontractInput,
  type UpdateSubcontractInput,
  type UpdateSubcontractMetaInput,
} from "@bloqer/validators";
import { log, sanitizeAuditPayload } from "../audit/audit.service";
import { sortByWbsCode } from "../budget/wbs-code-rules";
import { companyScopeFilter, isCrossCompany } from "../company-scope";
import { assertSubcontractsTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceError, type ServiceContext } from "../types";
import {
  assertProjectAllowsOperationalMutation,
  lockProjectForOperationalMutation,
} from "../project/project-operational-guard";
import { requireProjectAccess } from "../security/access";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeUnitPriceDecimal,
  toMoneyDecimal,
} from "../finance/money-decimal";
import { resolveActiveCompanyId } from "../company/company.service";
import { assertWbsLineForProject } from "../procurement/procurement-wbs";
import { assertContactRoleInTenant } from "../contact/assert-contact-role";
import { canEditSubcontractsArea, canViewSubcontractsArea } from "./subcontract-access";
import {
  assertSubcontractAccess,
  assertSubcontractParents,
  assertSubcontractWbsParent,
  lockSubcontractMutation,
  subcontractInclude,
  subcontractWbsInclude,
  type SubcontractRecord,
} from "./subcontract-scope";
import {
  assertSubcontractDateRange,
  parseSubcontractInput,
  subcontractLineTotal,
} from "./subcontract-values";

export type SubcontractLineView = {
  id: string;
  subcontractId: string;
  wbsNodeId: string | null;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  certifiedQuantity: string;
  remainingQty: string;
  notes: string | null;
  sortOrder: number;
  wbsNode: { code: string; name: string } | null;
};
export type SubcontractView = Subcontract & {
  totalValue: string;
  totalCertified: string;
  subcontractorName: string;
  code: string;
  lines: SubcontractLineView[];
};
function serializeSubcontract(row: SubcontractRecord): SubcontractView {
  const { subcontractorContact, lines, certifications } = row;
  return {
    id: row.id,
    tenantId: row.tenantId,
    companyId: row.companyId,
    projectId: row.projectId,
    subcontractorContactId: row.subcontractorContactId,
    number: row.number,
    title: row.title,
    description: row.description,
    contractDate: row.contractDate,
    startDate: row.startDate,
    expectedEndDate: row.expectedEndDate,
    currency: row.currency,
    status: row.status,
    notes: row.notes,
    internalNotes: row.internalNotes,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    code: "SC-" + String(row.number).padStart(3, "0"),
    subcontractorName: subcontractorContact.fantasyName ?? subcontractorContact.legalName,
    totalValue: serializeMoneyDecimal(
      lines.reduce((sum, line) => sum.plus(toMoneyDecimal(line.lineTotal)), new Prisma.Decimal(0)),
    ),
    totalCertified: serializeMoneyDecimal(
      certifications
        .filter((cert) => cert.status === "APPROVED")
        .reduce(
          (sum, cert) =>
            cert.lines.reduce(
              (subtotal, line) => subtotal.plus(toMoneyDecimal(line.lineTotal)),
              sum,
            ),
          new Prisma.Decimal(0),
        ),
    ),
    lines: lines.map((line) => ({
      id: line.id,
      subcontractId: line.subcontractId,
      wbsNodeId: line.wbsNodeId,
      description: line.description,
      unit: line.unit,
      quantity: serializeQtyDecimal(line.quantity),
      unitPrice: serializeUnitPriceDecimal(line.unitPrice),
      lineTotal: serializeMoneyDecimal(line.lineTotal),
      certifiedQuantity: serializeQtyDecimal(line.certifiedQuantity),
      remainingQty: serializeQtyDecimal(line.quantity.minus(line.certifiedQuantity)),
      notes: line.notes,
      sortOrder: line.sortOrder,
      wbsNode: line.wbsNode ? { code: line.wbsNode.code, name: line.wbsNode.name } : null,
    })),
  };
}
async function authorize(ctx: ServiceContext, edit = false) {
  await assertSubcontractsTenantModule(ctx);
  if (!(edit ? canEditSubcontractsArea(ctx.roles) : canViewSubcontractsArea(ctx.roles)))
    throw new ServiceError("FORBIDDEN", "Sin permisos para operar subcontratos");
}
async function loadSubcontract(id: string, ctx: ServiceContext): Promise<SubcontractRecord> {
  const row = await prisma.subcontract.findUnique({ where: { id }, include: subcontractInclude });
  if (!row) throw new ServiceError("NOT_FOUND", "Subcontrato no encontrado");
  await assertSubcontractAccess(row, ctx);
  assertSubcontractParents(row, row.lines);
  return row;
}
export async function getSubcontractById(
  id: string,
  ctx: ServiceContext,
): Promise<SubcontractView> {
  await authorize(ctx);
  return serializeSubcontract(await loadSubcontract(id, ctx));
}
export async function listSubcontractsByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<SubcontractView[]> {
  await authorize(ctx);
  await requireProjectAccess(projectId, ctx);
  const rows = await prisma.subcontract.findMany({
    // companyId is NOT NULL; global contexts retain all authorized companies.
    where: {
      projectId,
      tenantId: ctx.tenantId,
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    },
    include: subcontractInclude,
    orderBy: [{ number: "desc" }, { id: "asc" }],
  });
  return rows.map((row) => {
    assertSubcontractParents(row, row.lines);
    return serializeSubcontract(row);
  });
}
export type SubcontractFormWbsPickList = {
  companyId: string;
  wbsOptions: Array<{ id: string; code: string; name: string; unit: string; budgetName: string }>;
};
export async function getSubcontractFormWbsPickList(
  projectId: string,
  ctx: ServiceContext,
): Promise<SubcontractFormWbsPickList> {
  await authorize(ctx);
  const project = await requireProjectAccess(projectId, ctx);
  const companyId = await resolveActiveCompanyId(ctx, project.companyId);
  if (!companyId || isCrossCompany(companyId, ctx))
    throw new ServiceError(
      "VALIDATION",
      "No hay una empresa activa autorizada para crear el subcontrato",
    );
  const rows = sortByWbsCode(
    await prisma.wbsNode.findMany({
      where: {
        type: "ITEM",
        budget: {
          projectId,
          tenantId: ctx.tenantId,
          status: { in: ["APPROVED", "CLOSED"] },
          ...companyScopeFilter({ ...ctx, companyId }),
        },
      },
      include: {
        ...subcontractWbsInclude,
        budget: {
          select: {
            name: true,
            versionNumber: true,
            tenantId: true,
            companyId: true,
            projectId: true,
            status: true,
          },
        },
      },
    }),
    (a, b) =>
      a.budget.name.localeCompare(b.budget.name, "es") ||
      a.budget.versionNumber - b.budget.versionNumber,
  );
  for (const row of rows)
    assertSubcontractWbsParent(row, { tenantId: ctx.tenantId, companyId, projectId });
  return {
    companyId,
    wbsOptions: rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      unit: row.costItem?.unit ?? "",
      budgetName: row.budget.name + " v" + row.budget.versionNumber,
    })),
  };
}
async function validateLines(
  tx: Prisma.TransactionClient,
  lines: CreateSubcontractInput["lines"],
  scope: { projectId: string; companyId: string },
  ctx: ServiceContext,
) {
  for (const line of lines) {
    if (line.wbsNodeId)
      await assertWbsLineForProject(line.wbsNodeId, scope.projectId, ctx.tenantId, {
        ctx: { ...ctx, companyId: scope.companyId },
        db: tx,
      });
    subcontractLineTotal(new Prisma.Decimal(line.quantity), new Prisma.Decimal(line.unitPrice));
  }
}
async function writeLines(
  tx: Prisma.TransactionClient,
  subcontractId: string,
  lines: CreateSubcontractInput["lines"],
) {
  for (const [index, line] of lines.entries()) {
    const quantity = new Prisma.Decimal(line.quantity),
      unitPrice = new Prisma.Decimal(line.unitPrice);
    await tx.subcontractLine.create({
      data: {
        subcontractId,
        wbsNodeId: line.wbsNodeId ?? null,
        description: line.description,
        unit: line.unit,
        quantity,
        unitPrice,
        lineTotal: subcontractLineTotal(quantity, unitPrice),
        notes: line.notes ?? null,
        sortOrder: line.sortOrder ?? index,
      },
    });
  }
}
function audit(
  ctx: ServiceContext,
  row: { id: string; companyId: string; projectId: string },
  action: string,
  before: unknown,
  after: unknown,
  tx: Prisma.TransactionClient,
) {
  return log(
    {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      companyId: row.companyId,
      projectId: row.projectId,
      action,
      entityType: "Subcontract",
      entityId: row.id,
      before: sanitizeAuditPayload(before),
      after: sanitizeAuditPayload(after),
    },
    tx,
  );
}
export async function createSubcontract(
  raw: CreateSubcontractInput,
  ctx: ServiceContext,
): Promise<SubcontractView> {
  await authorize(ctx, true);
  const input = parseSubcontractInput(createSubcontractSchema, raw);
  if (isCrossCompany(input.companyId, ctx))
    throw new ServiceError("FORBIDDEN", "La empresa está fuera del contexto autorizado");
  await assertProjectAllowsOperationalMutation(input.projectId, ctx);
  const row = await prisma.$transaction(
    async (tx) => {
      const project = await lockProjectForOperationalMutation(tx, input.projectId, ctx);
      const setting = await tx.tenantModuleSetting.findFirst({
        where: { tenantId: ctx.tenantId, moduleKey: "SUBCONTRACTS" },
        select: { isEnabled: true },
      });
      if (setting?.isEnabled === false)
        throw new ServiceError("FORBIDDEN", "El módulo Subcontratos está deshabilitado");
      if (project.companyId && project.companyId !== input.companyId)
        throw new ServiceError("CONFLICT", "La empresa no corresponde a la obra");
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${input.companyId} AND "tenantId" = ${ctx.tenantId} FOR NO KEY UPDATE`;
      const company = await tx.company.findFirst({
        where: { id: input.companyId, tenantId: ctx.tenantId, status: "ACTIVE" },
      });
      if (!company) throw new ServiceError("NOT_FOUND", "Empresa activa no encontrada");
      await assertContactRoleInTenant(input.subcontractorContactId, "SUBCONTRACTOR", ctx.tenantId, {
        tx,
      });
      await validateLines(tx, input.lines, input, ctx);
      const max = await tx.subcontract.aggregate({
        where: { tenantId: ctx.tenantId, companyId: input.companyId },
        _max: { number: true },
      });
      const created = await tx.subcontract.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: input.companyId,
          projectId: input.projectId,
          subcontractorContactId: input.subcontractorContactId,
          number: (max._max.number ?? 0) + 1,
          title: input.title,
          description: input.description ?? null,
          contractDate: new Date(input.contractDate),
          startDate: input.startDate ? new Date(input.startDate) : null,
          expectedEndDate: input.expectedEndDate ? new Date(input.expectedEndDate) : null,
          currency: input.currency,
          notes: input.notes ?? null,
          internalNotes: input.internalNotes ?? null,
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
      });
      await writeLines(tx, created.id, input.lines);
      const result = await tx.subcontract.findUniqueOrThrow({
        where: { id: created.id },
        include: subcontractInclude,
      });
      assertSubcontractParents(result, result.lines);
      await audit(
        ctx,
        result,
        "SUBCONTRACT_CREATED",
        null,
        { number: result.number, title: result.title },
        tx,
      );
      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
  return serializeSubcontract(row);
}
export async function updateSubcontract(
  id: string,
  raw: UpdateSubcontractInput,
  ctx: ServiceContext,
): Promise<SubcontractView> {
  await authorize(ctx, true);
  const input = parseSubcontractInput(updateSubcontractSchema, raw),
    preview = await loadSubcontract(id, ctx);
  const row = await prisma.$transaction(
    async (tx) => {
      const current = await lockSubcontractMutation(tx, preview, ctx);
      if (current.status !== "DRAFT" || current.updatedAt.getTime() !== preview.updatedAt.getTime())
        throw new ServiceError(
          "CONFLICT",
          "El subcontrato ya no es el borrador revisado. Recargá e intentá de nuevo.",
        );
      if (input.lines) {
        if (
          (await tx.subcontractCertification.count({ where: { subcontractId: id } })) ||
          (await tx.subcontractCertificationLine.count({
            where: { subcontractLine: { subcontractId: id } },
          }))
        )
          throw new ServiceError(
            "CONFLICT",
            "No se pueden reemplazar líneas con certificaciones históricas vinculadas",
          );
        await validateLines(tx, input.lines, current, ctx);
      }
      const startDate =
        input.startDate === undefined
          ? current.startDate
          : input.startDate
            ? new Date(input.startDate)
            : null;
      const expectedEndDate =
        input.expectedEndDate === undefined
          ? current.expectedEndDate
          : input.expectedEndDate
            ? new Date(input.expectedEndDate)
            : null;
      if (input.startDate !== undefined || input.expectedEndDate !== undefined)
        assertSubcontractDateRange(startDate, expectedEndDate);
      await tx.subcontract.update({
        where: { id },
        data: {
          title: input.title ?? current.title,
          description: input.description === undefined ? current.description : input.description,
          contractDate: input.contractDate ? new Date(input.contractDate) : current.contractDate,
          startDate,
          expectedEndDate,
          notes: input.notes === undefined ? current.notes : input.notes,
          internalNotes:
            input.internalNotes === undefined ? current.internalNotes : input.internalNotes,
          updatedBy: ctx.actorUserId,
        },
      });
      if (input.lines) {
        await tx.subcontractLine.deleteMany({ where: { subcontractId: id } });
        await writeLines(tx, id, input.lines);
      }
      const result = await tx.subcontract.findUniqueOrThrow({
        where: { id },
        include: subcontractInclude,
      });
      assertSubcontractParents(result, result.lines);
      await audit(
        ctx,
        result,
        "SUBCONTRACT_UPDATED",
        { title: current.title, lineCount: current.lines.length },
        { title: result.title, lineCount: result.lines.length },
        tx,
      );
      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
  return serializeSubcontract(row);
}
export async function updateSubcontractMeta(
  id: string,
  raw: UpdateSubcontractMetaInput,
  ctx: ServiceContext,
): Promise<SubcontractView> {
  await authorize(ctx, true);
  const input = parseSubcontractInput(updateSubcontractMetaSchema, raw),
    preview = await loadSubcontract(id, ctx);
  const row = await prisma.$transaction(
    async (tx) => {
      const current = await lockSubcontractMutation(tx, preview, ctx);
      if (current.status === "CANCELLED" || current.status === "COMPLETED")
        throw new ServiceError("CONFLICT", "El subcontrato es de solo lectura");
      if (current.updatedAt.getTime() !== preview.updatedAt.getTime())
        throw new ServiceError("CONFLICT", "El subcontrato cambió. Recargá e intentá de nuevo.");
      const startDate =
        input.startDate === undefined
          ? current.startDate
          : input.startDate
            ? new Date(input.startDate)
            : null;
      const expectedEndDate =
        input.expectedEndDate === undefined
          ? current.expectedEndDate
          : input.expectedEndDate
            ? new Date(input.expectedEndDate)
            : null;
      if (input.startDate !== undefined || input.expectedEndDate !== undefined)
        assertSubcontractDateRange(startDate, expectedEndDate);
      const result = await tx.subcontract.update({
        where: { id },
        data: {
          notes: input.notes === undefined ? current.notes : input.notes,
          internalNotes:
            input.internalNotes === undefined ? current.internalNotes : input.internalNotes,
          startDate,
          expectedEndDate,
          updatedBy: ctx.actorUserId,
        },
        include: subcontractInclude,
      });
      await audit(
        ctx,
        result,
        "SUBCONTRACT_UPDATED",
        {
          notes: current.notes,
          internalNotes: current.internalNotes,
          startDate: current.startDate,
          expectedEndDate: current.expectedEndDate,
        },
        { notes: result.notes, internalNotes: result.internalNotes, startDate, expectedEndDate },
        tx,
      );
      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
  return serializeSubcontract(row);
}
export async function activateSubcontract(
  id: string,
  ctx: ServiceContext,
): Promise<SubcontractView> {
  await authorize(ctx, true);
  const preview = await loadSubcontract(id, ctx);
  const row = await prisma.$transaction(
    async (tx) => {
      const current = await lockSubcontractMutation(tx, preview, ctx);
      if (current.status !== "DRAFT" || !current.lines.length)
        throw new ServiceError("CONFLICT", "Solo se puede activar un borrador con líneas");
      await assertContactRoleInTenant(
        current.subcontractorContactId,
        "SUBCONTRACTOR",
        ctx.tenantId,
        { tx },
      );
      const content = parseSubcontractInput(createSubcontractSchema, {
        ...current,
        contractDate: current.contractDate.toISOString().slice(0, 10),
        startDate: current.startDate?.toISOString().slice(0, 10) ?? null,
        expectedEndDate: current.expectedEndDate?.toISOString().slice(0, 10) ?? null,
        lines: current.lines.map((line) => ({
          ...line,
          quantity: line.quantity.toString(),
          unitPrice: line.unitPrice.toString(),
        })),
      });
      await validateLines(tx, content.lines, current, ctx);
      const result = await tx.subcontract.update({
        where: { id },
        data: { status: "ACTIVE", updatedBy: ctx.actorUserId },
        include: subcontractInclude,
      });
      await audit(
        ctx,
        result,
        "SUBCONTRACT_ACTIVATED",
        { status: current.status },
        { status: result.status },
        tx,
      );
      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
  return serializeSubcontract(row);
}
export async function completeSubcontract(
  id: string,
  ctx: ServiceContext,
): Promise<SubcontractView> {
  await authorize(ctx, true);
  const preview = await loadSubcontract(id, ctx);
  const row = await prisma.$transaction(
    async (tx) => {
      const current = await lockSubcontractMutation(tx, preview, ctx);
      if (current.status !== "ACTIVE")
        throw new ServiceError("CONFLICT", "Solo se puede finalizar un subcontrato activo");
      if (
        await tx.subcontractCertification.count({ where: { subcontractId: id, status: "DRAFT" } })
      )
        throw new ServiceError(
          "CONFLICT",
          "Existen certificaciones en borrador. Emítilas o cancelalas antes de finalizar",
        );
      const result = await tx.subcontract.update({
        where: { id },
        data: { status: "COMPLETED", updatedBy: ctx.actorUserId },
        include: subcontractInclude,
      });
      await audit(
        ctx,
        result,
        "SUBCONTRACT_COMPLETED",
        { status: current.status },
        { status: result.status },
        tx,
      );
      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
  return serializeSubcontract(row);
}
export async function cancelSubcontract(
  id: string,
  ctx: ServiceContext,
  reason?: string,
): Promise<SubcontractView> {
  await authorize(ctx, true);
  const preview = await loadSubcontract(id, ctx);
  if (preview.status === "CANCELLED") return serializeSubcontract(preview);
  const input = parseSubcontractInput(cancelSubcontractSchema, { reason });
  const row = await prisma.$transaction(
    async (tx) => {
      const current = await lockSubcontractMutation(tx, preview, ctx, { reversal: true });
      if (current.status === "CANCELLED") return current;
      if (current.status === "COMPLETED")
        throw new ServiceError("CONFLICT", "Un subcontrato completado no puede anularse");
      if (
        await tx.subcontractCertification.count({
          where: { subcontractId: id, status: "APPROVED" },
        })
      )
        throw new ServiceError(
          "CONFLICT",
          "Existen certificaciones aprobadas vinculadas. Anulalas antes de anular el subcontrato",
        );
      const result = await tx.subcontract.update({
        where: { id },
        data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
        include: subcontractInclude,
      });
      await audit(
        ctx,
        result,
        "SUBCONTRACT_CANCELLED",
        { status: current.status },
        { status: result.status, reason: input.reason || null },
        tx,
      );
      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
  return serializeSubcontract(row);
}
export async function listSubcontractorContacts(projectId: string, ctx: ServiceContext) {
  await authorize(ctx);
  await requireProjectAccess(projectId, ctx);
  // Contacts have no company dimension; their role must still belong to this tenant.
  return prisma.contact.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "ACTIVE",
      roles: { some: { tenantId: ctx.tenantId, role: "SUBCONTRACTOR", status: "ACTIVE" } },
    },
    select: { id: true, legalName: true, fantasyName: true },
    orderBy: [{ legalName: "asc" }, { id: "asc" }],
  });
}
