import {
  Prisma,
  prisma,
  type SubcontractCertification,
  type SupplierInvoiceStatus,
} from "@bloqer/database";
import {
  createSubcontractCertificationSchema,
  updateSubcontractCertificationSchema,
  cancelSubcontractSchema,
  type CreateSubcontractCertificationInput,
  type UpdateSubcontractCertificationInput,
} from "@bloqer/validators";
import { log, sanitizeAuditPayload } from "../audit/audit.service";
import {
  assertApTenantModule,
  assertSubcontractsTenantModule,
} from "../tenant-modules/tenant-module-enforcement";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeUnitPriceDecimal,
  toMoneyDecimal,
} from "../finance/money-decimal";
import { resolveSuggestedApInvoiceLetter } from "../finance/resolve-suggested-invoice-letter";
import { subcontractCostType } from "../cost-control/cost-type";
import { ServiceError, type ServiceContext } from "../types";
import { canEditSubcontractsArea, canViewSubcontractsArea } from "./subcontract-access";
import { assertSubcontractCertSuccessionAllowed } from "./subcontract-cert-succession";
import { assertSubcontractCertificationLinesHaveWbs } from "./subcontract-cert-approve-guards";
import {
  assertSubcontractAccess,
  assertSubcontractCertificationParents,
  assertSubcontractParents,
  subcontractCertificationInclude,
  subcontractInclude,
  lockSubcontractMutation,
  type SubcontractCertificationRecord,
  type SubcontractRecord,
} from "./subcontract-scope";
import {
  assertSubcontractDateRange,
  assertSubcontractQuantityWithinBalance,
  parseSubcontractInput,
  subcontractLineTotal,
} from "./subcontract-values";
import { loadSubcontractSettlements, type SubcontractSettlement } from "./subcontract-settlement";

export type SubcontractCertificationLineView = {
  id: string;
  subcontractCertificationId: string;
  subcontractLineId: string;
  previousQty: string;
  currentQty: string;
  cumulativeQty: string;
  remainingQty: string;
  unitPriceSnapshot: string;
  lineTotal: string;
  notes: string | null;
  sortOrder: number;
  subcontractLine: { description: string; unit: string; quantity: string };
};
export type SubcontractCertificationView = SubcontractCertification &
  SubcontractSettlement & {
    totalAmount: string;
    currency: string;
    code: string;
    subcontractCode: string;
    subcontractorName: string;
    supplierInvoiceId: string | null;
    supplierInvoiceCode: string | null;
    supplierInvoiceStatus: SupplierInvoiceStatus | null;
    successorCertificationId: string | null;
    successorCertificationCode: string | null;
    lines: SubcontractCertificationLineView[];
  };
function serializeCert(
  row: SubcontractCertificationRecord,
  settlement: SubcontractSettlement,
): SubcontractCertificationView {
  const { subcontract, supplierInvoice, lines, replacedBy, ...fields } = row;
  return {
    ...fields,
    ...settlement,
    currency: subcontract.currency,
    code: "CERT-SC-" + String(row.number).padStart(3, "0"),
    subcontractCode: "SC-" + String(subcontract.number).padStart(3, "0"),
    subcontractorName:
      subcontract.subcontractorContact.fantasyName ?? subcontract.subcontractorContact.legalName,
    totalAmount: serializeMoneyDecimal(
      lines.reduce((sum, line) => sum.plus(toMoneyDecimal(line.lineTotal)), new Prisma.Decimal(0)),
    ),
    supplierInvoiceId: supplierInvoice?.id ?? null,
    supplierInvoiceCode: supplierInvoice
      ? "FP-" + String(supplierInvoice.number).padStart(5, "0")
      : null,
    supplierInvoiceStatus: supplierInvoice?.status ?? null,
    successorCertificationId: replacedBy[0]?.id ?? null,
    successorCertificationCode: replacedBy[0]
      ? "CERT-SC-" + String(replacedBy[0].number).padStart(3, "0")
      : null,
    lines: lines.map((line) => ({
      id: line.id,
      subcontractCertificationId: line.subcontractCertificationId,
      subcontractLineId: line.subcontractLineId,
      previousQty: serializeQtyDecimal(line.previousQty),
      currentQty: serializeQtyDecimal(line.currentQty),
      cumulativeQty: serializeQtyDecimal(line.cumulativeQty),
      remainingQty: serializeQtyDecimal(line.remainingQty),
      unitPriceSnapshot: serializeUnitPriceDecimal(line.unitPriceSnapshot),
      lineTotal: serializeMoneyDecimal(line.lineTotal),
      notes: line.notes,
      sortOrder: line.sortOrder,
      subcontractLine: {
        description: line.subcontractLine.description,
        unit: line.subcontractLine.unit,
        quantity: serializeQtyDecimal(line.subcontractLine.quantity),
      },
    })),
  };
}
async function view(row: SubcontractCertificationRecord, ctx: ServiceContext) {
  const settlements = await loadSubcontractSettlements([row], ctx);
  return serializeCert(row, settlements.get(row.id)!);
}
async function authorize(ctx: ServiceContext, edit = false) {
  await assertSubcontractsTenantModule(ctx);
  if (!(edit ? canEditSubcontractsArea(ctx.roles) : canViewSubcontractsArea(ctx.roles)))
    throw new ServiceError("FORBIDDEN", "Sin permisos para operar certificaciones de subcontrato");
}
async function loadCert(id: string, ctx: ServiceContext): Promise<SubcontractCertificationRecord> {
  const row = await prisma.subcontractCertification.findUnique({
    where: { id },
    include: subcontractCertificationInclude,
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Certificación de subcontrato no encontrada");
  await assertSubcontractAccess(row, ctx);
  assertSubcontractCertificationParents(row);
  return row;
}
async function lockedCert(
  tx: Prisma.TransactionClient,
  preview: SubcontractCertificationRecord,
  ctx: ServiceContext,
  reversal = false,
) {
  const parent = await lockSubcontractMutation(
    tx,
    { id: preview.subcontractId, companyId: preview.companyId, projectId: preview.projectId },
    ctx,
    { reversal },
  );
  await tx.$queryRaw`SELECT id FROM subcontract_certifications WHERE id = ${preview.id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
  const cert = await tx.subcontractCertification.findFirst({
    where: { id: preview.id, tenantId: ctx.tenantId },
    include: subcontractCertificationInclude,
  });
  if (
    !cert ||
    cert.subcontractId !== preview.subcontractId ||
    cert.companyId !== preview.companyId ||
    cert.projectId !== preview.projectId
  )
    throw new ServiceError("CONFLICT", "La certificación cambió. Recargá e intentá de nuevo.");
  assertSubcontractCertificationParents(cert);
  return { cert, parent };
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
      entityType: "SubcontractCertification",
      entityId: row.id,
      before: sanitizeAuditPayload(before),
      after: sanitizeAuditPayload(after),
    },
    tx,
  );
}
function activeParent(parent: SubcontractRecord) {
  if (parent.status !== "ACTIVE")
    throw new ServiceError(
      "CONFLICT",
      "Solo se pueden registrar o editar certificaciones en subcontratos activos",
    );
}
function assertNewLines(
  lines: CreateSubcontractCertificationInput["lines"],
  parent: SubcontractRecord,
) {
  for (const line of lines) {
    const source = parent.lines.find((item) => item.id === line.subcontractLineId);
    if (!source) throw new ServiceError("NOT_FOUND", "Línea del subcontrato no encontrada");
    assertSubcontractQuantityWithinBalance(
      new Prisma.Decimal(line.currentQty),
      source.certifiedQuantity,
      source.quantity,
    );
  }
}
async function writeLines(
  tx: Prisma.TransactionClient,
  certificationId: string,
  inputs: CreateSubcontractCertificationInput["lines"],
  parent: SubcontractRecord,
  existing: SubcontractCertificationRecord["lines"] = [],
) {
  for (const [index, input] of inputs.entries()) {
    const source = parent.lines.find((line) => line.id === input.subcontractLineId)!;
    const quantity = new Prisma.Decimal(input.currentQty),
      previous = source.certifiedQuantity;
    const previousLine = existing.find(
      (line) => line.subcontractLineId === input.subcontractLineId,
    );
    const price = previousLine?.unitPriceSnapshot ?? source.unitPrice;
    await tx.subcontractCertificationLine.create({
      data: {
        subcontractCertificationId: certificationId,
        subcontractLineId: source.id,
        previousQty: previous,
        currentQty: quantity,
        cumulativeQty: previous.plus(quantity),
        remainingQty: source.quantity.minus(previous.plus(quantity)),
        unitPriceSnapshot: price,
        lineTotal: subcontractLineTotal(quantity, price),
        notes: input.notes ?? null,
        sortOrder: index,
      },
    });
  }
}

export async function getSubcontractCertificationById(
  id: string,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView> {
  await authorize(ctx);
  return view(await loadCert(id, ctx), ctx);
}
export async function listSubcontractCertificationsBySubcontract(
  subcontractId: string,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView[]> {
  await authorize(ctx);
  const parent = await prisma.subcontract.findUnique({
    where: { id: subcontractId },
    include: subcontractInclude,
  });
  if (!parent) throw new ServiceError("NOT_FOUND", "Subcontrato no encontrado");
  await assertSubcontractAccess(parent, ctx);
  assertSubcontractParents(parent, parent.lines);
  const rows = await prisma.subcontractCertification.findMany({
    where: {
      subcontractId,
      tenantId: ctx.tenantId,
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    },
    include: subcontractCertificationInclude,
    orderBy: [{ number: "desc" }, { id: "asc" }],
  });
  for (const row of rows) assertSubcontractCertificationParents(row);
  const settlements = await loadSubcontractSettlements(rows, ctx);
  return rows.map((row) => serializeCert(row, settlements.get(row.id)!));
}

export async function createSubcontractCertification(
  raw: CreateSubcontractCertificationInput,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView> {
  await authorize(ctx, true);
  const input = parseSubcontractInput(createSubcontractCertificationSchema, raw);
  const preview = await prisma.subcontract.findUnique({
    where: { id: input.subcontractId },
    include: subcontractInclude,
  });
  if (!preview) throw new ServiceError("NOT_FOUND", "Subcontrato no encontrado");
  await assertSubcontractAccess(preview, ctx);
  assertSubcontractParents(preview, preview.lines);
  await assertProjectAllowsOperationalMutation(preview.projectId, ctx);
  const row = await prisma.$transaction(
    async (tx) => {
      const parent = await lockSubcontractMutation(tx, preview, ctx);
      activeParent(parent);
      assertNewLines(input.lines, parent);
      const replacesCertificationId = input.replacesCertificationId ?? null;
      if (replacesCertificationId) {
        const predecessor = await tx.subcontractCertification.findUnique({
          where: { id: replacesCertificationId },
          include: subcontractCertificationInclude,
        });
        if (predecessor) {
          await assertSubcontractAccess(predecessor, ctx);
          assertSubcontractCertificationParents(predecessor);
        }
        const successor = await tx.subcontractCertification.findFirst({
          where: { replacesCertificationId, status: { not: "CANCELLED" } },
          select: { id: true },
        });
        assertSubcontractCertSuccessionAllowed({
          replacesCertificationId,
          predecessor,
          subcontractId: parent.id,
          tenantId: ctx.tenantId,
          existingSuccessorId: successor?.id,
        });
      }
      const max = await tx.subcontractCertification.aggregate({
        where: { subcontractId: parent.id },
        _max: { number: true },
      });
      const created = await tx.subcontractCertification.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: parent.companyId,
          projectId: parent.projectId,
          subcontractId: parent.id,
          subcontractorContactId: parent.subcontractorContactId,
          number: (max._max.number ?? 0) + 1,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
          certificationDate: new Date(input.certificationDate),
          replacesCertificationId,
          notes: input.notes ?? null,
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
      });
      await writeLines(tx, created.id, input.lines, parent);
      const result = await tx.subcontractCertification.findUniqueOrThrow({
        where: { id: created.id },
        include: subcontractCertificationInclude,
      });
      await audit(
        ctx,
        result,
        "SUBCONTRACT_CERTIFICATION_CREATED",
        null,
        { number: result.number, subcontractId: parent.id, replacesCertificationId },
        tx,
      );
      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
  return view(row, ctx);
}

export async function updateSubcontractCertification(
  id: string,
  raw: UpdateSubcontractCertificationInput,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView> {
  await authorize(ctx, true);
  const input = parseSubcontractInput(updateSubcontractCertificationSchema, raw),
    preview = await loadCert(id, ctx);
  const row = await prisma.$transaction(
    async (tx) => {
      const { cert, parent } = await lockedCert(tx, preview, ctx);
      activeParent(parent);
      if (cert.status !== "DRAFT" || cert.updatedAt.getTime() !== preview.updatedAt.getTime())
        throw new ServiceError(
          "CONFLICT",
          "La certificación ya no es el borrador revisado. Recargá e intentá de nuevo.",
        );
      if (input.lines) assertNewLines(input.lines, parent);
      const periodStart = input.periodStart ? new Date(input.periodStart) : cert.periodStart,
        periodEnd = input.periodEnd ? new Date(input.periodEnd) : cert.periodEnd;
      if (input.periodStart !== undefined || input.periodEnd !== undefined)
        assertSubcontractDateRange(periodStart, periodEnd);
      await tx.subcontractCertification.update({
        where: { id },
        data: {
          periodStart,
          periodEnd,
          certificationDate: input.certificationDate
            ? new Date(input.certificationDate)
            : cert.certificationDate,
          notes: input.notes === undefined ? cert.notes : input.notes,
          updatedBy: ctx.actorUserId,
        },
      });
      if (input.lines) {
        await tx.subcontractCertificationLine.deleteMany({
          where: { subcontractCertificationId: id },
        });
        await writeLines(tx, id, input.lines, parent, cert.lines);
      }
      const result = await tx.subcontractCertification.findUniqueOrThrow({
        where: { id },
        include: subcontractCertificationInclude,
      });
      await audit(
        ctx,
        result,
        "SUBCONTRACT_CERTIFICATION_UPDATED",
        { notes: cert.notes, lineCount: cert.lines.length },
        { notes: result.notes, lineCount: result.lines.length },
        tx,
      );
      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
  return view(row, ctx);
}

export async function issueSubcontractCertification(
  id: string,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView> {
  await authorize(ctx, true);
  const preview = await loadCert(id, ctx);
  const row = await prisma.$transaction(
    async (tx) => {
      const { cert, parent } = await lockedCert(tx, preview, ctx);
      activeParent(parent);
      if (cert.status !== "DRAFT" || !cert.lines.length)
        throw new ServiceError("CONFLICT", "Solo se puede emitir un borrador con líneas");
      // Recheck the same contract quantities after acquiring the operational locks.
      const inputs = cert.lines.map((line) => ({
        subcontractLineId: line.subcontractLineId,
        currentQty: line.currentQty.toString(),
        notes: line.notes,
      }));
      parseSubcontractInput(updateSubcontractCertificationSchema, { lines: inputs });
      assertNewLines(inputs, parent);
      const result = await tx.subcontractCertification.update({
        where: { id },
        data: { status: "ISSUED", updatedBy: ctx.actorUserId },
        include: subcontractCertificationInclude,
      });
      await audit(
        ctx,
        result,
        "SUBCONTRACT_CERTIFICATION_ISSUED",
        { status: cert.status },
        { status: result.status },
        tx,
      );
      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
  return view(row, ctx);
}

export async function approveSubcontractCertification(
  id: string,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView> {
  await authorize(ctx, true);
  await assertApTenantModule(ctx);
  const preview = await loadCert(id, ctx);
  const suggestedLetter = await resolveSuggestedApInvoiceLetter({
    companyId: preview.companyId,
    supplierContactId: preview.subcontractorContactId,
    tenantId: ctx.tenantId,
  });
  const row = await prisma.$transaction(
    async (tx) => {
      const { cert, parent } = await lockedCert(tx, preview, ctx);
      const ap = await tx.tenantModuleSetting.findFirst({
        where: { tenantId: ctx.tenantId, moduleKey: "AP" },
        select: { isEnabled: true },
      });
      if (ap?.isEnabled === false)
        throw new ServiceError("FORBIDDEN", "El módulo Cuentas por pagar (AP) está deshabilitado");
      if (cert.status !== "ISSUED" || !cert.lines.length)
        throw new ServiceError(
          "CONFLICT",
          "Solo se puede aprobar una certificación emitida con líneas",
        );
      if (parent.status !== "ACTIVE" && parent.status !== "COMPLETED")
        throw new ServiceError("CONFLICT", "El subcontrato no permite nuevas obligaciones");
      if (cert.supplierInvoice)
        throw new ServiceError("CONFLICT", "La certificación ya tiene una factura vinculada");
      assertSubcontractCertificationLinesHaveWbs(cert.lines);
      const inputs = cert.lines.map((line) => ({
        subcontractLineId: line.subcontractLineId,
        currentQty: line.currentQty.toString(),
        notes: line.notes,
      }));
      parseSubcontractInput(updateSubcontractCertificationSchema, { lines: inputs });
      assertNewLines(inputs, parent);
      let totalAmount = new Prisma.Decimal(0);
      for (const line of cert.lines) {
        const source = parent.lines.find((item) => item.id === line.subcontractLineId)!;
        if (!line.unitPriceSnapshot.isFinite() || line.unitPriceSnapshot.lessThan(0))
          throw new ServiceError(
            "CONFLICT",
            "El precio histórico de la certificación es inválido. Revisá el documento origen.",
          );
        const lineTotal = subcontractLineTotal(line.currentQty, line.unitPriceSnapshot);
        if (serializeMoneyDecimal(line.lineTotal) !== serializeMoneyDecimal(lineTotal))
          throw new ServiceError(
            "CONFLICT",
            "Los importes de la certificación son inconsistentes. Revisá el documento origen.",
          );
        totalAmount = totalAmount.plus(lineTotal);
        const cumulative = source.certifiedQuantity.plus(line.currentQty);
        await tx.subcontractCertificationLine.update({
          where: { id: line.id },
          data: {
            previousQty: source.certifiedQuantity,
            cumulativeQty: cumulative,
            remainingQty: source.quantity.minus(cumulative),
            lineTotal,
          },
        });
        await tx.subcontractLine.update({
          where: { id: source.id },
          data: { certifiedQuantity: cumulative },
        });
      }
      subcontractLineTotal(new Prisma.Decimal(1), totalAmount);
      const max = await tx.supplierInvoice.aggregate({
        where: { tenantId: ctx.tenantId, companyId: cert.companyId, documentKind: "INVOICE" },
        _max: { number: true },
      });
      const invoice = await tx.supplierInvoice.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: cert.companyId,
          projectId: cert.projectId,
          supplierContactId: cert.subcontractorContactId,
          subcontractCertificationId: id,
          number: (max._max.number ?? 0) + 1,
          issueDate: cert.certificationDate,
          dueDate: cert.certificationDate,
          currency: parent.currency,
          invoiceLetter: suggestedLetter,
          subtotal: totalAmount,
          taxAmount: new Prisma.Decimal(0),
          iibbPerceptionRate: new Prisma.Decimal(0),
          iibbPerceptionAmount: new Prisma.Decimal(0),
          totalAmount,
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
      });
      for (const [index, line] of cert.lines.entries())
        await tx.supplierInvoiceLine.create({
          data: {
            invoiceId: invoice.id,
            description: line.subcontractLine.description,
            quantity: line.currentQty,
            unitPrice: line.unitPriceSnapshot,
            taxRate: new Prisma.Decimal(0),
            costType: subcontractCostType(),
            wbsNodeId: line.subcontractLine.wbsNodeId,
            lineSubtotal: subcontractLineTotal(line.currentQty, line.unitPriceSnapshot),
            lineTax: new Prisma.Decimal(0),
            lineTotal: subcontractLineTotal(line.currentQty, line.unitPriceSnapshot),
            sortOrder: index,
          },
        });
      const result = await tx.subcontractCertification.update({
        where: { id },
        data: { status: "APPROVED", updatedBy: ctx.actorUserId },
        include: subcontractCertificationInclude,
      });
      await audit(
        ctx,
        result,
        "SUBCONTRACT_CERTIFICATION_APPROVED",
        { status: cert.status },
        { status: result.status, supplierInvoiceId: invoice.id },
        tx,
      );
      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
  return view(row, ctx);
}

export async function rejectSubcontractCertification(
  id: string,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView> {
  await authorize(ctx, true);
  const preview = await loadCert(id, ctx);
  const row = await prisma.$transaction(
    async (tx) => {
      const { cert } = await lockedCert(tx, preview, ctx);
      if (cert.status !== "ISSUED")
        throw new ServiceError("CONFLICT", "Solo se puede rechazar una certificación emitida");
      const result = await tx.subcontractCertification.update({
        where: { id },
        data: { status: "REJECTED", updatedBy: ctx.actorUserId },
        include: subcontractCertificationInclude,
      });
      await audit(
        ctx,
        result,
        "SUBCONTRACT_CERTIFICATION_REJECTED",
        { status: cert.status },
        { status: result.status },
        tx,
      );
      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
  return view(row, ctx);
}

export async function cancelSubcontractCertification(
  id: string,
  ctx: ServiceContext,
  reason?: string,
): Promise<SubcontractCertificationView> {
  await authorize(ctx, true);
  const preview = await loadCert(id, ctx);
  if (preview.status === "CANCELLED") return view(preview, ctx);
  const input = parseSubcontractInput(cancelSubcontractSchema, { reason });
  const row = await prisma.$transaction(
    async (tx) => {
      const { cert, parent } = await lockedCert(tx, preview, ctx, true);
      if (cert.status === "CANCELLED") return cert;
      if (cert.status === "REJECTED")
        throw new ServiceError(
          "CONFLICT",
          "Una certificación rechazada es terminal y no puede anularse",
        );
      if ((cert.status === "ISSUED" || cert.status === "APPROVED") && !input.reason)
        throw new ServiceError("VALIDATION", "Indicá el motivo de la anulación");
      if (cert.status === "APPROVED") {
        if (!cert.supplierInvoice)
          throw new ServiceError(
            "CONFLICT",
            "Falta la factura vinculada. Revisá la certificación antes de revertir sus cantidades.",
          );
        if (cert.supplierInvoice.status === "ISSUED")
          throw new ServiceError(
            "CONFLICT",
            "La factura vinculada ya fue emitida. Primero anulá esa factura.",
          );
        const payable = await tx.payable.findUnique({
          where: { supplierInvoiceId: cert.supplierInvoice.id },
          include: {
            payments: { where: { status: "CONFIRMED" }, select: { id: true } },
            creditApplications: { where: { status: "CONFIRMED" }, select: { id: true } },
          },
        });
        if (
          payable &&
          (cert.supplierInvoice.status === "DRAFT" ||
            payable.tenantId !== cert.tenantId ||
            payable.companyId !== cert.companyId ||
            payable.projectId !== cert.projectId ||
            payable.supplierContactId !== cert.subcontractorContactId ||
            payable.status !== "CANCELLED" ||
            payable.paidAmount.greaterThan(0) ||
            payable.creditedAmount.greaterThan(0) ||
            payable.payments.length ||
            payable.creditApplications.length)
        )
          throw new ServiceError(
            "CONFLICT",
            "Los efectos financieros vinculados no están anulados. Revisá la factura y Cuentas por pagar.",
          );
        if (cert.supplierInvoice.status === "DRAFT") {
          const ap = await tx.tenantModuleSetting.findFirst({
            where: { tenantId: ctx.tenantId, moduleKey: "AP" },
            select: { isEnabled: true },
          });
          if (ap?.isEnabled === false)
            throw new ServiceError(
              "FORBIDDEN",
              "El módulo Cuentas por pagar (AP) está deshabilitado",
            );
        }
        const quantities = new Map<string, Prisma.Decimal>();
        for (const line of cert.lines)
          quantities.set(
            line.subcontractLineId,
            (quantities.get(line.subcontractLineId) ?? new Prisma.Decimal(0)).plus(line.currentQty),
          );
        for (const [lineId, quantity] of quantities) {
          const source = parent.lines.find((item) => item.id === lineId);
          if (
            !source ||
            quantity.lessThanOrEqualTo(0) ||
            source.certifiedQuantity.lessThan(quantity)
          )
            throw new ServiceError(
              "CONFLICT",
              "Las cantidades vigentes no permiten esta reversión. Revisá los documentos de origen.",
            );
          await tx.subcontractLine.update({
            where: { id: lineId },
            data: { certifiedQuantity: source.certifiedQuantity.minus(quantity) },
          });
        }
        if (cert.supplierInvoice.status === "DRAFT")
          await tx.supplierInvoice.update({
            where: { id: cert.supplierInvoice.id },
            data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
          });
      }
      const result = await tx.subcontractCertification.update({
        where: { id },
        data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
        include: subcontractCertificationInclude,
      });
      await audit(
        ctx,
        result,
        "SUBCONTRACT_CERTIFICATION_CANCELLED",
        { status: cert.status },
        {
          status: result.status,
          reason: input.reason || null,
          wasApproved: cert.status === "APPROVED",
        },
        tx,
      );
      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
  return view(row, ctx);
}
