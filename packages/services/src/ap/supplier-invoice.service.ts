import { Prisma, prisma, SupplierInvoice } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateSupplierInvoiceInput, UpdateSupplierInvoiceInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { canViewApProjectArea } from "./ap-access";
import { calcLine, recalcSupplierInvoiceTotals } from "./supplier-invoice-calc.service";

// ─── View types ───────────────────────────────────────────────────────────────

export type SupplierInvoiceLineView = {
  id: string;
  invoiceId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  lineSubtotal: string;
  lineTax: string;
  lineTotal: string;
  sortOrder: number;
};

export type SupplierInvoiceView = Omit<SupplierInvoice, "subtotal" | "taxAmount" | "totalAmount"> & {
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  code: string;
  lines: SupplierInvoiceLineView[];
  supplierName: string;
};

// ─── Guard ────────────────────────────────────────────────────────────────────

export function assertSupplierInvoiceEditable(invoice: SupplierInvoice): void {
  if (invoice.status !== "DRAFT") {
    throw new ServiceError(
      "CONFLICT",
      `La factura en estado "${invoice.status}" no puede editarse.`,
    );
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getSupplierInvoiceById(
  id: string,
  ctx: ServiceContext,
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas de proveedor");
  }
  const inv = await prisma.supplierInvoice.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      supplierContact: { select: { legalName: true, fantasyName: true } },
    },
  });
  if (!inv) throw new ServiceError("NOT_FOUND", "Factura de proveedor no encontrada");
  if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return serializeInvoice(inv);
}

export async function listSupplierInvoicesByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<SupplierInvoiceView[]> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas de proveedor");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const invoices = await prisma.supplierInvoice.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      supplierContact: { select: { legalName: true, fantasyName: true } },
    },
    orderBy: { number: "asc" },
  });
  return invoices.map(serializeInvoice);
}

// ─── Resolve company ──────────────────────────────────────────────────────────

async function resolveCompanyId(projectId: string, ctx: ServiceContext): Promise<string> {
  if (ctx.companyId) return ctx.companyId;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { companyId: true } });
  if (project?.companyId) return project.companyId;
  const company = await prisma.company.findFirst({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!company) throw new ServiceError("CONFLICT", "No hay empresa activa para registrar la factura");
  return company.id;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createSupplierInvoice(
  input: CreateSupplierInvoiceInput,
  ctx: ServiceContext,
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear facturas de proveedor");
  }

  const project = await prisma.project.findUnique({ where: { id: input.projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  // BR-AP-001: validate supplier role
  const supplierRole = await prisma.contactRole.findUnique({
    where: { contactId_role: { contactId: input.supplierContactId, role: "SUPPLIER" } },
  });
  if (!supplierRole || supplierRole.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "El contacto seleccionado no tiene rol de proveedor activo");
  }

  // Optional PO link: validate supplier/project/company/currency consistency
  if (input.purchaseOrderId) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId } });
    if (!po) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
    if (po.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (po.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "No se puede vincular a una orden de compra anulada");
    }
    if (po.status === "DRAFT") {
      throw new ServiceError("CONFLICT", "No se puede vincular a una orden de compra en borrador");
    }
    if (po.projectId !== input.projectId) {
      throw new ServiceError("CONFLICT", "La orden de compra no pertenece al mismo proyecto");
    }
    if (po.supplierContactId !== input.supplierContactId) {
      throw new ServiceError("CONFLICT", "La orden de compra corresponde a un proveedor diferente");
    }
    if (po.currency !== (input.currency ?? "ARS")) {
      throw new ServiceError("CONFLICT", "La moneda de la factura no coincide con la de la orden de compra");
    }
  }

  const companyId = await resolveCompanyId(input.projectId, ctx);

  const maxNum = await prisma.supplierInvoice.aggregate({
    where: { tenantId: ctx.tenantId, companyId },
    _max: { number: true },
  });
  const number = (maxNum._max.number ?? 0) + 1;

  const inv = await prisma.$transaction(async (tx) => {
    const created = await tx.supplierInvoice.create({
      data: {
        tenantId:          ctx.tenantId,
        companyId,
        projectId:         input.projectId,
        supplierContactId: input.supplierContactId,
        number,
        issueDate:         new Date(input.issueDate),
        dueDate:           new Date(input.dueDate),
        currency:          input.currency ?? "ARS",
        notes:             input.notes ?? null,
        internalNotes:     input.internalNotes ?? null,
        purchaseOrderId:   input.purchaseOrderId ?? null,
        createdBy:         ctx.actorUserId,
        updatedBy:         ctx.actorUserId,
      },
    });

    for (const line of input.lines) {
      const qty   = new Prisma.Decimal(line.quantity);
      const price = new Prisma.Decimal(line.unitPrice);
      const rate  = new Prisma.Decimal(line.taxRate ?? "0");
      const { lineSubtotal, lineTax, lineTotal } = calcLine(qty, price, rate);
      await tx.supplierInvoiceLine.create({
        data: {
          invoiceId:   created.id,
          description: line.description,
          quantity:    qty,
          unitPrice:   price,
          taxRate:     rate,
          lineSubtotal,
          lineTax,
          lineTotal,
          sortOrder: line.sortOrder ?? 0,
        },
      });
    }

    await recalcSupplierInvoiceTotals(tx, created.id);

    return tx.supplierInvoice.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
    });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "supplier_invoice.created",
    entityType: "SupplierInvoice",
    entityId: inv.id,
    after: { number, projectId: input.projectId },
    ipAddress: ctx.ipAddress,
  });

  return serializeInvoice(inv);
}

export async function updateSupplierInvoice(
  id: string,
  input: UpdateSupplierInvoiceInput,
  ctx: ServiceContext,
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar facturas de proveedor");
  }

  const existing = await prisma.supplierInvoice.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertSupplierInvoiceEditable(existing);

  if (input.supplierContactId && input.supplierContactId !== existing.supplierContactId) {
    const supplierRole = await prisma.contactRole.findUnique({
      where: { contactId_role: { contactId: input.supplierContactId, role: "SUPPLIER" } },
    });
    if (!supplierRole || supplierRole.status !== "ACTIVE") {
      throw new ServiceError("CONFLICT", "El contacto seleccionado no tiene rol de proveedor activo");
    }
  }

  // Optional PO link validation on update
  if (input.purchaseOrderId !== undefined && input.purchaseOrderId !== null) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId } });
    if (!po) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
    if (po.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (po.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "No se puede vincular a una orden de compra anulada");
    }
    if (po.status === "DRAFT") {
      throw new ServiceError("CONFLICT", "No se puede vincular a una orden de compra en borrador");
    }
    if (po.projectId !== existing.projectId) {
      throw new ServiceError("CONFLICT", "La orden de compra no pertenece al mismo proyecto");
    }
    const supplierToCheck = input.supplierContactId ?? existing.supplierContactId;
    if (po.supplierContactId !== supplierToCheck) {
      throw new ServiceError("CONFLICT", "La orden de compra corresponde a un proveedor diferente");
    }
    if (po.currency !== existing.currency) {
      throw new ServiceError("CONFLICT", "La moneda de la factura no coincide con la de la orden de compra");
    }
  }

  const inv = await prisma.$transaction(async (tx) => {
    await tx.supplierInvoice.update({
      where: { id },
      data: {
        supplierContactId: input.supplierContactId,
        issueDate:       input.issueDate ? new Date(input.issueDate) : undefined,
        dueDate:         input.dueDate   ? new Date(input.dueDate)   : undefined,
        notes:           input.notes,
        internalNotes:   input.internalNotes,
        purchaseOrderId: input.purchaseOrderId !== undefined ? input.purchaseOrderId : undefined,
        updatedBy:       ctx.actorUserId,
      },
    });

    if (input.lines) {
      await tx.supplierInvoiceLine.deleteMany({ where: { invoiceId: id } });
      for (const line of input.lines) {
        const qty   = new Prisma.Decimal(line.quantity);
        const price = new Prisma.Decimal(line.unitPrice);
        const rate  = new Prisma.Decimal(line.taxRate ?? "0");
        const { lineSubtotal, lineTax, lineTotal } = calcLine(qty, price, rate);
        await tx.supplierInvoiceLine.create({
          data: {
            invoiceId: id,
            description: line.description,
            quantity: qty,
            unitPrice: price,
            taxRate: rate,
            lineSubtotal,
            lineTax,
            lineTotal,
            sortOrder: line.sortOrder ?? 0,
          },
        });
      }
      await recalcSupplierInvoiceTotals(tx, id);
    }

    return tx.supplierInvoice.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
    });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "supplier_invoice.updated",
    entityType: "SupplierInvoice",
    entityId: id,
    ipAddress: ctx.ipAddress,
  });

  return serializeInvoice(inv);
}

export async function issueSupplierInvoice(
  id: string,
  ctx: ServiceContext,
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para emitir facturas de proveedor");
  }

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.supplierInvoice.findUnique({ where: { id } });
    if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
    if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (inv.status !== "DRAFT") {
      throw new ServiceError("CONFLICT", "Solo se pueden emitir facturas en estado Borrador");
    }

    const lineCount = await tx.supplierInvoiceLine.count({ where: { invoiceId: id } });
    if (lineCount === 0) {
      throw new ServiceError("CONFLICT", "La factura debe tener al menos una línea");
    }

    // Re-fetch totals
    await recalcSupplierInvoiceTotals(tx, id);
    const refreshed = await tx.supplierInvoice.findUniqueOrThrow({ where: { id } });
    if (refreshed.totalAmount.lessThanOrEqualTo(0)) {
      throw new ServiceError("CONFLICT", "El total de la factura debe ser mayor a 0");
    }

    await tx.supplierInvoice.update({
      where: { id },
      data: { status: "ISSUED", updatedBy: ctx.actorUserId },
    });

    // BR-AP-002: create Payable atomically
    await tx.payable.create({
      data: {
        tenantId:          inv.tenantId,
        companyId:         inv.companyId,
        projectId:         inv.projectId,
        supplierContactId: inv.supplierContactId,
        supplierInvoiceId: inv.id,
        issueDate:         inv.issueDate,
        dueDate:           inv.dueDate,
        currency:          inv.currency,
        originalAmount:    refreshed.totalAmount,
        paidAmount:        new Prisma.Decimal(0),
        status:            "OPEN",
        createdBy:         ctx.actorUserId,
        updatedBy:         ctx.actorUserId,
      },
    });

    return tx.supplierInvoice.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
    });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "supplier_invoice.issued",
    entityType: "SupplierInvoice",
    entityId: id,
    ipAddress: ctx.ipAddress,
  });

  return serializeInvoice(result);
}

export async function cancelSupplierInvoice(
  id: string,
  ctx: ServiceContext,
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar facturas de proveedor");
  }

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.supplierInvoice.findUnique({ where: { id } });
    if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
    if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (inv.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "La factura ya está cancelada");
    }

    // BR-AP-003: if ISSUED, cancel linked Payable only if no active payments
    if (inv.status === "ISSUED") {
      const payable = await tx.payable.findUnique({ where: { supplierInvoiceId: id } });
      if (payable) {
        const activePayments = await tx.payment.count({
          where: { payableId: payable.id, status: "CONFIRMED" },
        });
        if (activePayments > 0) {
          throw new ServiceError(
            "CONFLICT",
            "No se puede cancelar: existen pagos confirmados. Cancele los pagos primero.",
          );
        }
        await tx.payable.update({
          where: { id: payable.id },
          data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
        });
      }
    }

    await tx.supplierInvoice.update({
      where: { id },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });

    return tx.supplierInvoice.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
    });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "supplier_invoice.cancelled",
    entityType: "SupplierInvoice",
    entityId: id,
    ipAddress: ctx.ipAddress,
  });

  return serializeInvoice(result);
}

// ─── Serialization ────────────────────────────────────────────────────────────

type RawInvoice = SupplierInvoice & {
  lines: Array<{
    id: string;
    invoiceId: string;
    description: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    taxRate: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal;
    lineTax: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    sortOrder: number;
  }>;
  supplierContact: { legalName: string; fantasyName: string | null };
};

function serializeInvoice(inv: RawInvoice): SupplierInvoiceView {
  return {
    ...inv,
    subtotal:    inv.subtotal.toString(),
    taxAmount:   inv.taxAmount.toString(),
    totalAmount: inv.totalAmount.toString(),
    code:        `FP-${String(inv.number).padStart(5, "0")}`,
    supplierName: inv.supplierContact.fantasyName ?? inv.supplierContact.legalName,
    lines: inv.lines.map((l) => ({
      id:          l.id,
      invoiceId:   l.invoiceId,
      description: l.description,
      quantity:    l.quantity.toString(),
      unitPrice:   l.unitPrice.toString(),
      taxRate:     l.taxRate.toString(),
      lineSubtotal: l.lineSubtotal.toString(),
      lineTax:     l.lineTax.toString(),
      lineTotal:   l.lineTotal.toString(),
      sortOrder:   l.sortOrder,
    })),
  };
}
