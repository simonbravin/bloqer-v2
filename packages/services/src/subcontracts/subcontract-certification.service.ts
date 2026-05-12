import { Prisma, prisma, SubcontractCertification } from "@bloqer/database";
import { canEditSubcontractsArea, canViewSubcontractsArea } from "./subcontract-access";
import type { CreateSubcontractCertificationInput, UpdateSubcontractCertificationInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertSubcontractsTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";

// ─── View types ───────────────────────────────────────────────────────────────

export type SubcontractCertificationLineView = {
  id:                         string;
  subcontractCertificationId: string;
  subcontractLineId:          string;
  previousQty:                string;
  currentQty:                 string;
  cumulativeQty:              string;
  remainingQty:               string;
  unitPriceSnapshot:          string;
  lineTotal:                  string;
  notes:                      string | null;
  sortOrder:                  number;
  subcontractLine:            { description: string; unit: string; quantity: string };
};

export type SubcontractCertificationView = Omit<SubcontractCertification, never> & {
  totalAmount:       string;
  code:              string;
  subcontractCode:   string;
  subcontractorName: string;
  supplierInvoiceId: string | null;
  lines:             SubcontractCertificationLineView[];
};

// ─── Serializer ───────────────────────────────────────────────────────────────

type CertWithRelations = SubcontractCertification & {
  subcontract: { number: number };
  subcontractorContact: { legalName: string; fantasyName: string | null };
  supplierInvoice: { id: string } | null;
  lines: Array<{
    id: string; subcontractCertificationId: string; subcontractLineId: string;
    previousQty: Prisma.Decimal; currentQty: Prisma.Decimal;
    cumulativeQty: Prisma.Decimal; remainingQty: Prisma.Decimal;
    unitPriceSnapshot: Prisma.Decimal; lineTotal: Prisma.Decimal;
    notes: string | null; sortOrder: number;
    subcontractLine: { description: string; unit: string; quantity: Prisma.Decimal };
  }>;
};

function serializeCert(c: CertWithRelations): SubcontractCertificationView {
  const totalAmount = c.lines.reduce((sum, l) => sum.plus(l.lineTotal), new Prisma.Decimal(0));
  return {
    ...c,
    code:              `CERT-SC-${String(c.number).padStart(3, "0")}`,
    subcontractCode:   `SC-${String(c.subcontract.number).padStart(3, "0")}`,
    subcontractorName: c.subcontractorContact.fantasyName ?? c.subcontractorContact.legalName,
    totalAmount:       totalAmount.toString(),
    supplierInvoiceId: c.supplierInvoice?.id ?? null,
    lines: c.lines.map((l) => ({
      id:                         l.id,
      subcontractCertificationId: l.subcontractCertificationId,
      subcontractLineId:          l.subcontractLineId,
      previousQty:                l.previousQty.toString(),
      currentQty:                 l.currentQty.toString(),
      cumulativeQty:              l.cumulativeQty.toString(),
      remainingQty:               l.remainingQty.toString(),
      unitPriceSnapshot:          l.unitPriceSnapshot.toString(),
      lineTotal:                  l.lineTotal.toString(),
      notes:                      l.notes,
      sortOrder:                  l.sortOrder,
      subcontractLine: {
        description: l.subcontractLine.description,
        unit:        l.subcontractLine.unit,
        quantity:    l.subcontractLine.quantity.toString(),
      },
    })),
  };
}

const certInclude = {
  subcontract:          { select: { number: true } },
  subcontractorContact: { select: { legalName: true, fantasyName: true } },
  supplierInvoice:      { select: { id: true } },
  lines: {
    include: { subcontractLine: { select: { description: true, unit: true, quantity: true } } },
    orderBy: { sortOrder: "asc" as const },
  },
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getSubcontractCertificationById(
  id: string,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView> {
  await assertSubcontractsTenantModule(ctx);
  if (!canViewSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver certificaciones de subcontrato");
  }
  const cert = await prisma.subcontractCertification.findUnique({ where: { id }, include: certInclude });
  if (!cert) throw new ServiceError("NOT_FOUND", "Certificación de subcontrato no encontrada");
  if (cert.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return serializeCert(cert);
}

export async function listSubcontractCertificationsBySubcontract(
  subcontractId: string,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView[]> {
  await assertSubcontractsTenantModule(ctx);
  if (!canViewSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver certificaciones de subcontrato");
  }
  const sub = await prisma.subcontract.findUnique({ where: { id: subcontractId } });
  if (!sub) throw new ServiceError("NOT_FOUND", "Subcontrato no encontrado");
  if (sub.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const certs = await prisma.subcontractCertification.findMany({
    where: { subcontractId, tenantId: ctx.tenantId },
    include: certInclude,
    orderBy: { number: "desc" },
  });
  return certs.map(serializeCert);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createSubcontractCertification(
  input: CreateSubcontractCertificationInput,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView> {
  await assertSubcontractsTenantModule(ctx);
  if (!canEditSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear certificaciones de subcontrato");
  }

  const sub = await prisma.subcontract.findUnique({
    where: { id: input.subcontractId },
    include: { lines: true },
  });
  if (!sub) throw new ServiceError("NOT_FOUND", "Subcontrato no encontrado");
  if (sub.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (sub.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", `Solo se pueden crear certificaciones en subcontratos activos. Estado actual: "${sub.status}"`);
  }

  // Validate lines and quantities
  for (const inputLine of input.lines) {
    const subLine = sub.lines.find((l) => l.id === inputLine.subcontractLineId);
    if (!subLine) {
      throw new ServiceError("NOT_FOUND", `Línea de subcontrato no encontrada: ${inputLine.subcontractLineId}`);
    }
    const currentQty = new Prisma.Decimal(inputLine.currentQty);
    if (currentQty.lessThanOrEqualTo(0)) {
      throw new ServiceError("CONFLICT", `La cantidad a certificar debe ser mayor a cero: ${subLine.description}`);
    }
    const remaining = subLine.quantity.minus(subLine.certifiedQuantity);
    if (currentQty.greaterThan(remaining)) {
      throw new ServiceError(
        "CONFLICT",
        `Cantidad a certificar (${currentQty}) excede el saldo pendiente (${remaining}) para: ${subLine.description}`,
      );
    }
  }

  const maxNum = await prisma.subcontractCertification.aggregate({
    where: { subcontractId: input.subcontractId },
    _max: { number: true },
  });
  const number = (maxNum._max.number ?? 0) + 1;

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.subcontractCertification.create({
      data: {
        tenantId:               sub.tenantId,
        companyId:              sub.companyId,
        projectId:              sub.projectId,
        subcontractId:          input.subcontractId,
        subcontractorContactId: sub.subcontractorContactId,
        number,
        periodStart:            new Date(input.periodStart),
        periodEnd:              new Date(input.periodEnd),
        certificationDate:      new Date(input.certificationDate),
        notes:                  input.notes ?? null,
        createdBy:              ctx.actorUserId,
        updatedBy:              ctx.actorUserId,
      },
    });

    for (let i = 0; i < input.lines.length; i++) {
      const inputLine = input.lines[i]!;
      const subLine   = sub.lines.find((l) => l.id === inputLine.subcontractLineId)!;
      const currentQty    = new Prisma.Decimal(inputLine.currentQty);
      const previousQty   = subLine.certifiedQuantity;
      const cumulativeQty = previousQty.plus(currentQty);
      const remainingQty  = subLine.quantity.minus(cumulativeQty);
      await tx.subcontractCertificationLine.create({
        data: {
          subcontractCertificationId: created.id,
          subcontractLineId:          inputLine.subcontractLineId,
          previousQty,
          currentQty,
          cumulativeQty,
          remainingQty,
          unitPriceSnapshot: subLine.unitPrice,
          lineTotal:         currentQty.times(subLine.unitPrice),
          notes:             inputLine.notes ?? null,
          sortOrder:         i,
        },
      });
    }

    return tx.subcontractCertification.findUniqueOrThrow({ where: { id: created.id }, include: certInclude });
  });

  await log({
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "SUBCONTRACT_CERTIFICATION_CREATED", entityType: "SubcontractCertification", entityId: result.id,
    after: { subcontractId: input.subcontractId, number },
  });

  return serializeCert(result);
}

// ─── Update (DRAFT only) ──────────────────────────────────────────────────────

export async function updateSubcontractCertification(
  id: string,
  input: UpdateSubcontractCertificationInput,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView> {
  await assertSubcontractsTenantModule(ctx);
  if (!canEditSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar certificaciones de subcontrato");
  }

  const existing = await prisma.subcontractCertification.findUnique({
    where: { id },
    include: { subcontract: { include: { lines: true } } },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Certificación de subcontrato no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `La certificación en estado "${existing.status}" no puede editarse`);
  }

  if (input.lines) {
    const subLines = existing.subcontract.lines;
    for (const inputLine of input.lines) {
      const subLine = subLines.find((l) => l.id === inputLine.subcontractLineId);
      if (!subLine) throw new ServiceError("NOT_FOUND", `Línea de subcontrato no encontrada: ${inputLine.subcontractLineId}`);
      const currentQty = new Prisma.Decimal(inputLine.currentQty);
      if (currentQty.lessThanOrEqualTo(0)) {
        throw new ServiceError("CONFLICT", `La cantidad debe ser mayor a cero: ${subLine.description}`);
      }
      const remaining = subLine.quantity.minus(subLine.certifiedQuantity);
      if (currentQty.greaterThan(remaining)) {
        throw new ServiceError("CONFLICT", `Cantidad (${currentQty}) excede saldo pendiente (${remaining}) para: ${subLine.description}`);
      }
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.subcontractCertification.update({
      where: { id },
      data: {
        periodStart:       input.periodStart       ? new Date(input.periodStart)       : existing.periodStart,
        periodEnd:         input.periodEnd         ? new Date(input.periodEnd)         : existing.periodEnd,
        certificationDate: input.certificationDate ? new Date(input.certificationDate) : existing.certificationDate,
        notes:             input.notes !== undefined ? input.notes : existing.notes,
        updatedBy:         ctx.actorUserId,
      },
    });

    if (input.lines) {
      await tx.subcontractCertificationLine.deleteMany({ where: { subcontractCertificationId: id } });
      const subLines = existing.subcontract.lines;
      for (let i = 0; i < input.lines.length; i++) {
        const inputLine = input.lines[i]!;
        const subLine   = subLines.find((l) => l.id === inputLine.subcontractLineId)!;
        const currentQty    = new Prisma.Decimal(inputLine.currentQty);
        const previousQty   = subLine.certifiedQuantity;
        const cumulativeQty = previousQty.plus(currentQty);
        const remainingQty  = subLine.quantity.minus(cumulativeQty);
        await tx.subcontractCertificationLine.create({
          data: {
            subcontractCertificationId: id,
            subcontractLineId:          inputLine.subcontractLineId,
            previousQty,
            currentQty,
            cumulativeQty,
            remainingQty,
            unitPriceSnapshot: subLine.unitPrice,
            lineTotal:         currentQty.times(subLine.unitPrice),
            notes:             inputLine.notes ?? null,
            sortOrder:         i,
          },
        });
      }
    }

    return tx.subcontractCertification.findUniqueOrThrow({ where: { id }, include: certInclude });
  });

  return serializeCert(result);
}

// ─── Issue ────────────────────────────────────────────────────────────────────

export async function issueSubcontractCertification(
  id: string,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView> {
  await assertSubcontractsTenantModule(ctx);
  if (!canEditSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para emitir certificaciones de subcontrato");
  }

  const existing = await prisma.subcontractCertification.findUnique({
    where: { id },
    include: { lines: { select: { id: true } } },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Certificación de subcontrato no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `La certificación en estado "${existing.status}" no puede emitirse`);
  }
  if (existing.lines.length === 0) {
    throw new ServiceError("CONFLICT", "La certificación no tiene líneas");
  }

  const updated = await prisma.subcontractCertification.update({
    where: { id },
    data: { status: "ISSUED", updatedBy: ctx.actorUserId },
    include: certInclude,
  });

  await log({
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "SUBCONTRACT_CERTIFICATION_ISSUED", entityType: "SubcontractCertification", entityId: id,
    after: { status: "ISSUED" },
  });

  return serializeCert(updated);
}

// ─── Approve ─────────────────────────────────────────────────────────────────

export async function approveSubcontractCertification(
  id: string,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView> {
  await assertSubcontractsTenantModule(ctx);
  if (!canEditSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para aprobar certificaciones de subcontrato");
  }

  const existing = await prisma.subcontractCertification.findUnique({
    where: { id },
    include: {
      lines: {
        include: { subcontractLine: { select: { unitPrice: true, description: true } } },
      },
      subcontract: { select: { companyId: true, currency: true, number: true } },
      subcontractorContact: { select: { legalName: true, fantasyName: true } },
    },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Certificación de subcontrato no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status !== "ISSUED") {
    throw new ServiceError("CONFLICT", `La certificación en estado "${existing.status}" no puede aprobarse. Debe estar emitida (ISSUED).`);
  }

  const companyId = existing.companyId;
  const maxNum = await prisma.supplierInvoice.aggregate({
    where: { tenantId: ctx.tenantId, companyId },
    _max: { number: true },
  });
  const invoiceNumber = (maxNum._max.number ?? 0) + 1;

  const result = await prisma.$transaction(async (tx) => {
    // Increment certifiedQuantity on each subcontract line
    for (const line of existing.lines) {
      await tx.subcontractLine.update({
        where: { id: line.subcontractLineId },
        data: { certifiedQuantity: { increment: line.currentQty } },
      });
    }

    // Create SupplierInvoice DRAFT
    const totalAmount = existing.lines.reduce(
      (sum, l) => sum.plus(l.lineTotal),
      new Prisma.Decimal(0),
    );
    const invoice = await tx.supplierInvoice.create({
      data: {
        tenantId:                  ctx.tenantId,
        companyId,
        projectId:                 existing.projectId,
        supplierContactId:         existing.subcontractorContactId,
        subcontractCertificationId: id,
        number:                    invoiceNumber,
        issueDate:                 existing.certificationDate,
        dueDate:                   existing.certificationDate,
        currency:                  existing.subcontract.currency,
        subtotal:                  totalAmount,
        taxAmount:                 new Prisma.Decimal(0),
        totalAmount,
        createdBy:                 ctx.actorUserId,
        updatedBy:                 ctx.actorUserId,
      },
    });

    for (let i = 0; i < existing.lines.length; i++) {
      const line = existing.lines[i]!;
      await tx.supplierInvoiceLine.create({
        data: {
          invoiceId:   invoice.id,
          description: line.subcontractLine.description,
          quantity:    line.currentQty,
          unitPrice:   line.unitPriceSnapshot,
          taxRate:     new Prisma.Decimal(0),
          lineSubtotal: line.lineTotal,
          lineTax:     new Prisma.Decimal(0),
          lineTotal:   line.lineTotal,
          sortOrder:   i,
        },
      });
    }

    // Approve the certification
    return tx.subcontractCertification.update({
      where: { id },
      data: { status: "APPROVED", updatedBy: ctx.actorUserId },
      include: certInclude,
    });
  });

  await log({
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "SUBCONTRACT_CERTIFICATION_APPROVED", entityType: "SubcontractCertification", entityId: id,
    after: { status: "APPROVED" },
  });

  return serializeCert(result);
}

// ─── Reject ───────────────────────────────────────────────────────────────────

export async function rejectSubcontractCertification(
  id: string,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView> {
  await assertSubcontractsTenantModule(ctx);
  if (!canEditSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para rechazar certificaciones de subcontrato");
  }

  const existing = await prisma.subcontractCertification.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Certificación de subcontrato no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status !== "ISSUED") {
    throw new ServiceError("CONFLICT", `La certificación en estado "${existing.status}" no puede rechazarse. Solo pueden rechazarse certificaciones emitidas.`);
  }

  const updated = await prisma.subcontractCertification.update({
    where: { id },
    data: { status: "REJECTED", updatedBy: ctx.actorUserId },
    include: certInclude,
  });

  await log({
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "SUBCONTRACT_CERTIFICATION_REJECTED", entityType: "SubcontractCertification", entityId: id,
    after: { status: "REJECTED" },
  });

  return serializeCert(updated);
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelSubcontractCertification(
  id: string,
  ctx: ServiceContext,
): Promise<SubcontractCertificationView> {
  await assertSubcontractsTenantModule(ctx);
  if (!canEditSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para anular certificaciones de subcontrato");
  }

  const existing = await prisma.subcontractCertification.findUnique({
    where: { id },
    include: {
      lines: { select: { subcontractLineId: true, currentQty: true } },
      supplierInvoice: { select: { id: true, status: true } },
    },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Certificación de subcontrato no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  if (existing.status === "CANCELLED") {
    throw new ServiceError("CONFLICT", "La certificación ya está anulada");
  }
  if (existing.status === "REJECTED") {
    throw new ServiceError("CONFLICT", "Una certificación rechazada no puede anularse. Ya no tiene efectos.");
  }

  // If APPROVED, must reverse effects — but only if linked invoice is DRAFT
  if (existing.status === "APPROVED") {
    if (!existing.supplierInvoice) {
      // Unexpected state — allow cancel anyway, just reverse qty
    } else if (existing.supplierInvoice.status === "ISSUED") {
      throw new ServiceError(
        "CONFLICT",
        "No se puede anular: la factura de proveedor vinculada ya fue emitida. Primero anulá/cancelá la factura de proveedor vinculada.",
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    if (existing.status === "APPROVED") {
      // Reverse certifiedQuantity on each subcontract line
      for (const line of existing.lines) {
        const subLine = await tx.subcontractLine.findUnique({ where: { id: line.subcontractLineId } });
        if (!subLine) throw new ServiceError("NOT_FOUND", "Línea de subcontrato no encontrada al revertir certificación");
        const newQty = subLine.certifiedQuantity.minus(line.currentQty);
        if (newQty.lessThan(0)) {
          throw new ServiceError("CONFLICT", "Error de integridad: la reversión resultaría en cantidad negativa. Contacte soporte.");
        }
        await tx.subcontractLine.update({
          where: { id: line.subcontractLineId },
          data: { certifiedQuantity: newQty },
        });
      }

      // Cancel linked supplier invoice if DRAFT
      if (existing.supplierInvoice && existing.supplierInvoice.status === "DRAFT") {
        await tx.supplierInvoice.update({
          where: { id: existing.supplierInvoice.id },
          data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
        });
      }
    }

    return tx.subcontractCertification.update({
      where: { id },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
      include: certInclude,
    });
  });

  await log({
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "SUBCONTRACT_CERTIFICATION_CANCELLED", entityType: "SubcontractCertification", entityId: id,
    after: { wasApproved: existing.status === "APPROVED" },
  });

  return serializeCert(result);
}
