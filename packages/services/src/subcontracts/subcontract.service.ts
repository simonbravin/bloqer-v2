import { Prisma, prisma, Subcontract } from "@bloqer/database";
import { canEditSubcontractsArea, canViewSubcontractsArea } from "./subcontract-access";
import type { CreateSubcontractInput, UpdateSubcontractInput, UpdateSubcontractMetaInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertSubcontractsTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";

// ─── View types ───────────────────────────────────────────────────────────────

export type SubcontractLineView = {
  id:                string;
  subcontractId:     string;
  wbsNodeId:         string | null;
  description:       string;
  unit:              string;
  quantity:          string;
  unitPrice:         string;
  lineTotal:         string;
  certifiedQuantity: string;
  remainingQty:      string;
  notes:             string | null;
  sortOrder:         number;
  wbsNode:           { code: string; name: string } | null;
};

export type SubcontractView = Omit<Subcontract, never> & {
  totalValue:             string;
  totalCertified:         string;
  subcontractorName:      string;
  code:                   string;
  lines:                  SubcontractLineView[];
};

// ─── Serializer ───────────────────────────────────────────────────────────────

type SubcontractWithRelations = Subcontract & {
  subcontractorContact: { legalName: string; fantasyName: string | null };
  lines: Array<{
    id: string; subcontractId: string; wbsNodeId: string | null;
    description: string; unit: string;
    quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal;
    certifiedQuantity: Prisma.Decimal; notes: string | null; sortOrder: number;
    wbsNode: { code: string; name: string } | null;
  }>;
};

function serializeSubcontract(s: SubcontractWithRelations): SubcontractView {
  const totalValue     = s.lines.reduce((sum, l) => sum.plus(l.lineTotal), new Prisma.Decimal(0));
  const totalCertified = s.lines.reduce((sum, l) => sum.plus(l.certifiedQuantity.times(l.unitPrice)), new Prisma.Decimal(0));
  return {
    ...s,
    code:              `SC-${String(s.number).padStart(3, "0")}`,
    subcontractorName: s.subcontractorContact.fantasyName ?? s.subcontractorContact.legalName,
    totalValue:        totalValue.toString(),
    totalCertified:    totalCertified.toString(),
    lines: s.lines.map((l) => ({
      id:                l.id,
      subcontractId:     l.subcontractId,
      wbsNodeId:         l.wbsNodeId,
      description:       l.description,
      unit:              l.unit,
      quantity:          l.quantity.toString(),
      unitPrice:         l.unitPrice.toString(),
      lineTotal:         l.lineTotal.toString(),
      certifiedQuantity: l.certifiedQuantity.toString(),
      remainingQty:      l.quantity.minus(l.certifiedQuantity).toString(),
      notes:             l.notes,
      sortOrder:         l.sortOrder,
      wbsNode:           l.wbsNode,
    })),
  };
}

const subcontractInclude = {
  subcontractorContact: { select: { legalName: true, fantasyName: true } },
  lines: {
    include: { wbsNode: { select: { code: true, name: true } } },
    orderBy: { sortOrder: "asc" as const },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveCompanyId(projectId: string, ctx: ServiceContext): Promise<string> {
  if (ctx.companyId) return ctx.companyId;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { companyId: true } });
  if (project?.companyId) return project.companyId;
  const company = await prisma.company.findFirst({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!company) throw new ServiceError("CONFLICT", "No hay empresa activa");
  return company.id;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getSubcontractById(id: string, ctx: ServiceContext): Promise<SubcontractView> {
  await assertSubcontractsTenantModule(ctx);
  if (!canViewSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver subcontratos");
  }
  const s = await prisma.subcontract.findUnique({ where: { id }, include: subcontractInclude });
  if (!s) throw new ServiceError("NOT_FOUND", "Subcontrato no encontrado");
  if (s.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return serializeSubcontract(s);
}

export async function listSubcontractsByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<SubcontractView[]> {
  await assertSubcontractsTenantModule(ctx);
  if (!canViewSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver subcontratos");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const subcontracts = await prisma.subcontract.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    include: subcontractInclude,
    orderBy: { number: "desc" },
  });
  return subcontracts.map(serializeSubcontract);
}

/** WBS lines from approved/closed budgets for subcontract create/edit forms (no Prisma in `apps/web` pages). */
export type SubcontractFormWbsPickList = {
  companyId: string;
  wbsOptions: Array<{ id: string; code: string; name: string; unit: string }>;
};

export async function getSubcontractFormWbsPickList(
  projectId: string,
  ctx: ServiceContext,
): Promise<SubcontractFormWbsPickList> {
  await assertSubcontractsTenantModule(ctx);
  if (!canViewSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver subcontratos");
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true, companyId: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const wbsNodes = await prisma.wbsNode.findMany({
    where: {
      type: "ITEM",
      budget: { projectId, status: { in: ["APPROVED", "CLOSED"] } },
    },
    select: { id: true, code: true, name: true, costItem: { select: { unit: true } } },
    orderBy: { code: "asc" },
  });

  return {
    companyId: project.companyId ?? ctx.companyId ?? "",
    wbsOptions: wbsNodes.map((n) => ({
      id: n.id,
      code: n.code,
      name: n.name,
      unit: n.costItem?.unit ?? "",
    })),
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createSubcontract(
  input: CreateSubcontractInput,
  ctx: ServiceContext,
): Promise<SubcontractView> {
  await assertSubcontractsTenantModule(ctx);
  if (!canEditSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear subcontratos");
  }

  const project = await prisma.project.findUnique({ where: { id: input.projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const subcontractorRole = await prisma.contactRole.findUnique({
    where: { contactId_role: { contactId: input.subcontractorContactId, role: "SUBCONTRACTOR" } },
  });
  if (!subcontractorRole || subcontractorRole.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "El contacto no tiene rol de subcontratista activo");
  }

  for (const line of input.lines) {
    if (line.wbsNodeId) {
      const wbs = await prisma.wbsNode.findUnique({ where: { id: line.wbsNodeId } });
      if (!wbs) throw new ServiceError("NOT_FOUND", `Nodo WBS no encontrado: ${line.wbsNodeId}`);
      if (wbs.type !== "ITEM") throw new ServiceError("CONFLICT", "El nodo WBS debe ser de tipo ITEM");
    }
  }

  const companyId = input.companyId ?? await resolveCompanyId(input.projectId, ctx);
  const maxNum = await prisma.subcontract.aggregate({
    where: { tenantId: ctx.tenantId, companyId },
    _max: { number: true },
  });
  const number = (maxNum._max.number ?? 0) + 1;

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.subcontract.create({
      data: {
        tenantId:               ctx.tenantId,
        companyId,
        projectId:              input.projectId,
        subcontractorContactId: input.subcontractorContactId,
        number,
        title:                  input.title,
        description:            input.description ?? null,
        contractDate:           new Date(input.contractDate),
        startDate:              input.startDate ? new Date(input.startDate) : null,
        expectedEndDate:        input.expectedEndDate ? new Date(input.expectedEndDate) : null,
        currency:               input.currency ?? "ARS",
        notes:                  input.notes ?? null,
        internalNotes:          input.internalNotes ?? null,
        createdBy:              ctx.actorUserId,
        updatedBy:              ctx.actorUserId,
      },
    });

    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i]!;
      const qty   = new Prisma.Decimal(line.quantity);
      const price = new Prisma.Decimal(line.unitPrice);
      await tx.subcontractLine.create({
        data: {
          subcontractId: created.id,
          wbsNodeId:     line.wbsNodeId ?? null,
          description:   line.description,
          unit:          line.unit ?? "",
          quantity:      qty,
          unitPrice:     price,
          lineTotal:     qty.times(price),
          notes:         line.notes ?? null,
          sortOrder:     line.sortOrder ?? i,
        },
      });
    }

    return tx.subcontract.findUniqueOrThrow({ where: { id: created.id }, include: subcontractInclude });
  });

  await log({
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "SUBCONTRACT_CREATED", entityType: "Subcontract", entityId: result.id,
    after: { projectId: input.projectId, number },
  });

  return serializeSubcontract(result);
}

export async function updateSubcontract(
  id: string,
  input: UpdateSubcontractInput,
  ctx: ServiceContext,
): Promise<SubcontractView> {
  await assertSubcontractsTenantModule(ctx);
  if (!canEditSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar subcontratos");
  }

  const existing = await prisma.subcontract.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Subcontrato no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `El subcontrato en estado "${existing.status}" no puede editarse. Use actualizar metadatos para campos no económicos.`);
  }

  if (input.lines) {
    for (const line of input.lines) {
      if (line.wbsNodeId) {
        const wbs = await prisma.wbsNode.findUnique({ where: { id: line.wbsNodeId } });
        if (!wbs) throw new ServiceError("NOT_FOUND", `Nodo WBS no encontrado: ${line.wbsNodeId}`);
        if (wbs.type !== "ITEM") throw new ServiceError("CONFLICT", "El nodo WBS debe ser de tipo ITEM");
      }
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.subcontract.update({
      where: { id },
      data: {
        title:          input.title          ?? existing.title,
        description:    input.description    !== undefined ? input.description    : existing.description,
        contractDate:   input.contractDate   ? new Date(input.contractDate)   : existing.contractDate,
        startDate:      input.startDate      !== undefined ? (input.startDate ? new Date(input.startDate) : null) : existing.startDate,
        expectedEndDate: input.expectedEndDate !== undefined ? (input.expectedEndDate ? new Date(input.expectedEndDate) : null) : existing.expectedEndDate,
        notes:          input.notes          !== undefined ? input.notes          : existing.notes,
        internalNotes:  input.internalNotes  !== undefined ? input.internalNotes  : existing.internalNotes,
        updatedBy:      ctx.actorUserId,
      },
    });

    if (input.lines) {
      await tx.subcontractLine.deleteMany({ where: { subcontractId: id } });
      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i]!;
        const qty   = new Prisma.Decimal(line.quantity);
        const price = new Prisma.Decimal(line.unitPrice);
        await tx.subcontractLine.create({
          data: {
            subcontractId: id,
            wbsNodeId:     line.wbsNodeId ?? null,
            description:   line.description,
            unit:          line.unit ?? "",
            quantity:      qty,
            unitPrice:     price,
            lineTotal:     qty.times(price),
            notes:         line.notes ?? null,
            sortOrder:     line.sortOrder ?? i,
          },
        });
      }
    }

    return tx.subcontract.findUniqueOrThrow({ where: { id }, include: subcontractInclude });
  });

  await log({
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "SUBCONTRACT_UPDATED", entityType: "Subcontract", entityId: id,
    after: { title: result.title },
  });

  return serializeSubcontract(result);
}

export async function updateSubcontractMeta(
  id: string,
  input: UpdateSubcontractMetaInput,
  ctx: ServiceContext,
): Promise<SubcontractView> {
  await assertSubcontractsTenantModule(ctx);
  if (!canEditSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar subcontratos");
  }

  const existing = await prisma.subcontract.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Subcontrato no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status === "CANCELLED" || existing.status === "COMPLETED") {
    throw new ServiceError("CONFLICT", `El subcontrato en estado "${existing.status}" es de solo lectura`);
  }

  const updated = await prisma.subcontract.update({
    where: { id },
    data: {
      notes:           input.notes          !== undefined ? input.notes          : existing.notes,
      internalNotes:   input.internalNotes  !== undefined ? input.internalNotes  : existing.internalNotes,
      expectedEndDate: input.expectedEndDate !== undefined ? (input.expectedEndDate ? new Date(input.expectedEndDate) : null) : existing.expectedEndDate,
      startDate:       input.startDate       !== undefined ? (input.startDate ? new Date(input.startDate) : null) : existing.startDate,
      updatedBy:       ctx.actorUserId,
    },
    include: subcontractInclude,
  });

  return serializeSubcontract(updated);
}

export async function activateSubcontract(id: string, ctx: ServiceContext): Promise<SubcontractView> {
  await assertSubcontractsTenantModule(ctx);
  if (!canEditSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para activar subcontratos");
  }

  const existing = await prisma.subcontract.findUnique({ where: { id }, include: { lines: { select: { id: true } } } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Subcontrato no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `El subcontrato en estado "${existing.status}" no puede activarse`);
  }
  if (existing.lines.length === 0) {
    throw new ServiceError("CONFLICT", "El subcontrato debe tener al menos una línea antes de activarse");
  }

  const updated = await prisma.subcontract.update({
    where: { id },
    data: { status: "ACTIVE", updatedBy: ctx.actorUserId },
    include: subcontractInclude,
  });

  await log({
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "SUBCONTRACT_ACTIVATED", entityType: "Subcontract", entityId: id, after: { status: "ACTIVE" },
  });

  return serializeSubcontract(updated);
}

export async function completeSubcontract(id: string, ctx: ServiceContext): Promise<SubcontractView> {
  await assertSubcontractsTenantModule(ctx);
  if (!canEditSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para finalizar subcontratos");
  }

  const existing = await prisma.subcontract.findUnique({
    where: { id },
    include: { certifications: { where: { status: "DRAFT" }, select: { id: true } } },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Subcontrato no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", `El subcontrato en estado "${existing.status}" no puede finalizarse`);
  }
  if (existing.certifications.length > 0) {
    throw new ServiceError("CONFLICT", "Existen certificaciones en borrador. Emítalas o cancélelas antes de finalizar el subcontrato");
  }

  const updated = await prisma.subcontract.update({
    where: { id },
    data: { status: "COMPLETED", updatedBy: ctx.actorUserId },
    include: subcontractInclude,
  });

  await log({
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "SUBCONTRACT_COMPLETED", entityType: "Subcontract", entityId: id, after: { status: "COMPLETED" },
  });

  return serializeSubcontract(updated);
}

export async function cancelSubcontract(id: string, ctx: ServiceContext): Promise<SubcontractView> {
  await assertSubcontractsTenantModule(ctx);
  if (!canEditSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para anular subcontratos");
  }

  const existing = await prisma.subcontract.findUnique({
    where: { id },
    include: { certifications: { where: { status: "APPROVED" }, select: { id: true } } },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Subcontrato no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status === "CANCELLED") {
    throw new ServiceError("CONFLICT", "El subcontrato ya está anulado");
  }
  if (existing.status === "COMPLETED") {
    throw new ServiceError("CONFLICT", "Un subcontrato completado no puede anularse");
  }
  if (existing.certifications.length > 0) {
    throw new ServiceError("CONFLICT", "Existen certificaciones aprobadas vinculadas. Cancélelas antes de anular el subcontrato");
  }

  const updated = await prisma.subcontract.update({
    where: { id },
    data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    include: subcontractInclude,
  });

  await log({
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "SUBCONTRACT_CANCELLED", entityType: "Subcontract", entityId: id, after: { status: "CANCELLED" },
  });

  return serializeSubcontract(updated);
}

// ─── Helpers for UI ───────────────────────────────────────────────────────────

export async function listSubcontractorContacts(projectId: string, ctx: ServiceContext) {
  await assertSubcontractsTenantModule(ctx);
  if (!canViewSubcontractsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  return prisma.contact.findMany({
    where: {
      tenantId: ctx.tenantId,
      status:   "ACTIVE",
      roles:    { some: { role: "SUBCONTRACTOR", status: "ACTIVE" } },
    },
    select: { id: true, legalName: true, fantasyName: true },
    orderBy: { legalName: "asc" },
  });
}
