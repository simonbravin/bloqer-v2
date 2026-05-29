import { Prisma, prisma, SupplierInvoice } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateSupplierInvoiceInput, UpdateSupplierInvoiceInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { assertCanCancelSupplierInvoice } from "./supplier-invoice-cancel-guards";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { resolvePagination } from "../finance/pagination";
import { canViewApProjectArea, canViewCompanyAp } from "./ap-access";
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
  /** When set (project workspace routes), corporate invoices (projectId null) and cross-project IDs are rejected. */
  projectScopeId?: string,
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
  if (projectScopeId !== undefined && inv.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a este proyecto");
  }
  return serializeInvoice(inv);
}

export type ProjectSupplierInvoiceListFilters = {
  page?: number;
  pageSize?: number;
};

export type ProjectSupplierInvoiceListRow = Omit<SupplierInvoiceView, "lines">;

export async function listSupplierInvoicesByProject(
  projectId: string,
  ctx: ServiceContext,
  filters?: ProjectSupplierInvoiceListFilters,
): Promise<{ data: ProjectSupplierInvoiceListRow[]; total: number }> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas de proveedor");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const { skip, take } = resolvePagination({
    page: filters?.page,
    pageSize: filters?.pageSize,
  });

  const where = { projectId, tenantId: ctx.tenantId };

  const [invoices, total] = await Promise.all([
    prisma.supplierInvoice.findMany({
      where,
      include: {
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
      orderBy: [{ number: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.supplierInvoice.count({ where }),
  ]);

  return { data: invoices.map(serializeInvoiceListRow), total };
}

export async function countOpenSupplierInvoicesByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<number> {
  await assertApTenantModule(ctx);
  if (!canViewApProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas de proveedor");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  return prisma.supplierInvoice.count({
    where: { projectId, tenantId: ctx.tenantId, status: "ISSUED" },
  });
}

export type CompanySupplierInvoiceListFilters = {
  status?:            "DRAFT" | "ISSUED" | "CANCELLED";
  supplierContactId?: string;
  issueDateFrom?:    string;
  issueDateTo?:      string;
  page?:              number;
  pageSize?:          number;
};

export type CompanySupplierInvoiceListRow = Omit<SupplierInvoiceView, "lines">;

/** AP at company level: invoices with no project. Requires VIEW AP (not VIEW PROJECTS). */
export async function listCompanySupplierInvoices(
  ctx: ServiceContext,
  filters?: CompanySupplierInvoiceListFilters,
): Promise<{ data: CompanySupplierInvoiceListRow[]; total: number }> {
  await assertApTenantModule(ctx);
  if (!canViewCompanyAp(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas de proveedor a nivel empresa");
  }

  const { skip, take } = resolvePagination({
    page: filters?.page,
    pageSize: filters?.pageSize,
  });

  const where: Prisma.SupplierInvoiceWhereInput = {
    tenantId:  ctx.tenantId,
    projectId: null,
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    ...(filters?.status ? { status: filters.status } : {}),
    ...(filters?.supplierContactId ? { supplierContactId: filters.supplierContactId } : {}),
    ...(filters?.issueDateFrom || filters?.issueDateTo
      ? {
          issueDate: {
            ...(filters.issueDateFrom ? { gte: new Date(filters.issueDateFrom) } : {}),
            ...(filters.issueDateTo ? { lte: new Date(filters.issueDateTo) } : {}),
          },
        }
      : {}),
  };

  const [invoices, total] = await Promise.all([
    prisma.supplierInvoice.findMany({
      where,
      include: {
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
      orderBy: [{ number: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.supplierInvoice.count({ where }),
  ]);

  const data = invoices.map(serializeInvoiceListRow);
  return { data, total };
}

/**
 * Corporate supplier invoice by id: tenant-safe and enforces `projectId === null`.
 * Use from `/finanzas/facturas-proveedor/...` only (not project workspace).
 */
export async function getCompanySupplierInvoiceById(
  id: string,
  ctx: ServiceContext,
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);
  if (!canViewCompanyAp(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas de proveedor a nivel empresa");
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
  if (inv.projectId !== null) {
    throw new ServiceError("FORBIDDEN", "Esta factura está asignada a un proyecto; usá el espacio de trabajo del proyecto");
  }
  if (ctx.companyId && inv.companyId !== ctx.companyId) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a la empresa activa");
  }
  return serializeInvoice(inv);
}

// ─── Resolve company (AP) ─────────────────────────────────────────────────────

/** companyId anchor: membership company, else project.company, else first ACTIVE company in tenant. */
export async function resolveCompanyIdForAp(
  projectId: string | null | undefined,
  ctx: ServiceContext,
): Promise<string> {
  if (ctx.companyId) return ctx.companyId;
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { companyId: true },
    });
    if (project?.companyId) return project.companyId;
  }
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

  const projectId = input.projectId ?? null;

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { tenantId: true, companyId: true },
    });
    if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
    if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (ctx.companyId && project.companyId && project.companyId !== ctx.companyId) {
      throw new ServiceError("FORBIDDEN", "El proyecto no pertenece a la empresa activa");
    }
  }

  // BR-AP-001: validate supplier role
  const supplierRole = await prisma.contactRole.findUnique({
    where: { contactId_role: { contactId: input.supplierContactId, role: "SUPPLIER" } },
  });
  if (!supplierRole || supplierRole.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "El contacto seleccionado no tiene rol de proveedor activo");
  }

  // Optional PO link: only when invoice is project-scoped (OC always belongs to a project)
  if (input.purchaseOrderId) {
    if (!projectId) {
      throw new ServiceError("CONFLICT", "Una orden de compra solo puede vincularse a una factura con proyecto");
    }
    const po = await prisma.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId } });
    if (!po) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
    if (po.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (po.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "No se puede vincular a una orden de compra anulada");
    }
    if (po.status === "DRAFT") {
      throw new ServiceError("CONFLICT", "No se puede vincular a una orden de compra en borrador");
    }
    if (po.projectId !== projectId) {
      throw new ServiceError("CONFLICT", "La orden de compra no pertenece al mismo proyecto");
    }
    if (po.supplierContactId !== input.supplierContactId) {
      throw new ServiceError("CONFLICT", "La orden de compra corresponde a un proveedor diferente");
    }
    if (po.currency !== (input.currency ?? "ARS")) {
      throw new ServiceError("CONFLICT", "La moneda de la factura no coincide con la de la orden de compra");
    }
  }

  const companyId = await resolveCompanyIdForAp(projectId, ctx);

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
        projectId:         projectId,
        supplierContactId: input.supplierContactId,
        number,
        issueDate:         new Date(input.issueDate),
        dueDate:           new Date(input.dueDate),
        currency:          input.currency ?? "ARS",
        fxRate: input.fxRate ? new Prisma.Decimal(input.fxRate) : new Prisma.Decimal(1),
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
    after: { number, projectId },
    ipAddress: ctx.ipAddress,
  });

  return serializeInvoice(inv);
}

export async function updateSupplierInvoice(
  id: string,
  input: UpdateSupplierInvoiceInput,
  ctx: ServiceContext,
  /** When set, rejects corporate invoices and cross-project edits (project workspace). */
  projectScopeId?: string,
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar facturas de proveedor");
  }

  const existing = await prisma.supplierInvoice.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (projectScopeId !== undefined && existing.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a este proyecto");
  }
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
    if (!existing.projectId) {
      throw new ServiceError("CONFLICT", "No se puede vincular una orden de compra a una factura corporativa sin proyecto");
    }
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
        fxRate: input.fxRate ? new Prisma.Decimal(input.fxRate) : undefined,
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
  /** When set, rejects corporate invoices and cross-project issue (project workspace). */
  projectScopeId?: string,
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para emitir facturas de proveedor");
  }

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.supplierInvoice.findUnique({ where: { id } });
    if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
    if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (projectScopeId !== undefined && inv.projectId !== projectScopeId) {
      throw new ServiceError("FORBIDDEN", "La factura no pertenece a este proyecto");
    }
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

    const { computeDocumentFxAmounts } = await import("../finance/fx-amount.service");
    const fx = computeDocumentFxAmounts(refreshed.currency, refreshed.totalAmount, refreshed.fxRate);

    await tx.supplierInvoice.update({
      where: { id },
      data: {
        status: "ISSUED",
        fxRate: fx.fxRate,
        amountArs: fx.amountArs,
        updatedBy: ctx.actorUserId,
      },
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
  /** When set, rejects corporate invoices and cross-project cancel (project workspace). */
  projectScopeId?: string,
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "AP")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar facturas de proveedor");
  }

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.supplierInvoice.findUnique({ where: { id } });
    if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
    if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (projectScopeId !== undefined && inv.projectId !== projectScopeId) {
      throw new ServiceError("FORBIDDEN", "La factura no pertenece a este proyecto");
    }
    if (inv.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "La factura ya está cancelada");
    }

    // BR-AP-003: if ISSUED, cancel linked Payable only if no active payments
    if (inv.status === "ISSUED") {
      const payable = await tx.payable.findUnique({ where: { supplierInvoiceId: id } });
      const activePaymentCount = payable
        ? await tx.payment.count({
            where: { payableId: payable.id, status: "CONFIRMED", tenantId: ctx.tenantId },
          })
        : 0;
      assertCanCancelSupplierInvoice({
        status: inv.status,
        hasPayable: payable != null,
        activePaymentCount,
        payablePaidAmount: payable?.paidAmount ?? null,
      });
      if (payable) {
        const payableCancel = await tx.payable.updateMany({
          where: {
            id: payable.id,
            status: { not: "CANCELLED" },
            paidAmount: payable.paidAmount,
          },
          data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
        });
        assertOptimisticRowUpdate(
          payableCancel.count,
          "El saldo cambió mientras cancelabas la factura. Revisá pagos e intentá de nuevo.",
        );
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

type RawInvoiceListRow = SupplierInvoice & {
  supplierContact: { legalName: string; fantasyName: string | null };
};

function serializeInvoiceListRow(inv: RawInvoiceListRow): CompanySupplierInvoiceListRow {
  return {
    ...inv,
    subtotal:    inv.subtotal.toString(),
    taxAmount:   inv.taxAmount.toString(),
    totalAmount: inv.totalAmount.toString(),
    code:        `FP-${String(inv.number).padStart(5, "0")}`,
    supplierName: inv.supplierContact.fantasyName ?? inv.supplierContact.legalName,
  };
}

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
