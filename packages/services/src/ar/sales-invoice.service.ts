import { Prisma, prisma, SalesInvoice, SalesInvoiceStatus } from "@bloqer/database";
import type {
  CreateSalesInvoiceInput,
  CreateInvoiceFromCertificationInput,
  UpdateSalesInvoiceInput,
} from "@bloqer/validators";
import { auditAr } from "./ar-audit";
import { assertCanCancelSalesInvoice } from "./sales-invoice-cancel-guards";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { assertArTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { canEditArArea, canViewArProjectArea } from "./ar-access";
import { resolvePagination } from "../finance/pagination";
import { calcLine, recalcInvoiceTotals } from "./sales-invoice-calc.service";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";

// ─── View types ───────────────────────────────────────────────────────────────

export type SalesInvoiceLineView = {
  id: string;
  invoiceId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  lineSubtotal: string;
  lineTax: string;
  lineTotal: string;
  certificationLineId: string | null;
  sortOrder: number;
};

export type SalesInvoiceWithLines = Omit<SalesInvoice, "subtotal" | "taxAmount" | "totalAmount"> & {
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  code: string;
  lines: SalesInvoiceLineView[];
  clientName: string;
};

// ─── Guard ────────────────────────────────────────────────────────────────────

export function assertInvoiceEditable(invoice: SalesInvoice): void {
  if (invoice.status !== "DRAFT") {
    throw new ServiceError(
      "CONFLICT",
      `La factura en estado "${invoice.status}" no puede editarse. Anule y cree una nueva.`,
    );
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getSalesInvoiceById(
  id: string,
  ctx: ServiceContext,
): Promise<SalesInvoiceWithLines> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas");
  }
  const inv = await prisma.salesInvoice.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      clientContact: { select: { legalName: true, fantasyName: true } },
    },
  });
  if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return serializeInvoice(inv);
}

export async function getActiveInvoiceForCertification(
  certificationId: string,
  ctx: ServiceContext,
): Promise<{ id: string; code: string } | null> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) return null;
  const inv = await prisma.salesInvoice.findFirst({
    where: { certificationId, tenantId: ctx.tenantId, status: { not: "CANCELLED" } },
    select: { id: true, number: true },
  });
  if (!inv) return null;
  return { id: inv.id, code: `FAC-${String(inv.number).padStart(5, "0")}` };
}

export type ProjectSalesInvoiceListFilters = {
  page?: number;
  pageSize?: number;
};

export type ProjectSalesInvoiceListRow = Omit<SalesInvoiceWithLines, "lines">;

export async function listInvoicesByProject(
  projectId: string,
  ctx: ServiceContext,
  filters?: ProjectSalesInvoiceListFilters,
): Promise<{ data: ProjectSalesInvoiceListRow[]; total: number }> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas");
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
    prisma.salesInvoice.findMany({
      where,
      include: {
        clientContact: { select: { legalName: true, fantasyName: true } },
      },
      orderBy: [{ number: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.salesInvoice.count({ where }),
  ]);
  return { data: invoices.map(serializeInvoiceListRow), total };
}

// ─── Resolve company ──────────────────────────────────────────────────────────


export async function countOpenSalesInvoicesByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<number> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas de venta");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  return prisma.salesInvoice.count({
    where: { projectId, tenantId: ctx.tenantId, status: "ISSUED" },
  });
}

async function resolveCompanyId(projectId: string, ctx: ServiceContext): Promise<string> {
  if (ctx.companyId) return ctx.companyId;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { companyId: true } });
  if (project?.companyId) return project.companyId;
  const company = await prisma.company.findFirst({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!company) throw new ServiceError("CONFLICT", "No hay empresa activa para emitir la factura");
  return company.id;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createSalesInvoice(
  input: CreateSalesInvoiceInput,
  ctx: ServiceContext,
): Promise<SalesInvoiceWithLines> {
  await assertArTenantModule(ctx);
  if (!canEditArArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear facturas");
  }

  await assertProjectAllowsOperationalMutation(input.projectId, ctx.tenantId);

  const companyId = await resolveCompanyId(input.projectId, ctx);

  const maxNum = await prisma.salesInvoice.aggregate({
    where: { tenantId: ctx.tenantId, companyId },
    _max: { number: true },
  });
  const number = (maxNum._max.number ?? 0) + 1;

  const inv = await prisma.$transaction(async (tx) => {
    const created = await tx.salesInvoice.create({
      data: {
        tenantId: ctx.tenantId,
        companyId,
        projectId: input.projectId,
        clientContactId: input.clientContactId,
        certificationId: input.certificationId ?? null,
        number,
        issueDate: new Date(input.issueDate),
        dueDate: new Date(input.dueDate),
        currency: input.currency ?? "ARS",
        notes: input.notes ?? null,
        internalNotes: input.internalNotes ?? null,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    for (const line of input.lines) {
      const qty   = new Prisma.Decimal(line.quantity);
      const price = new Prisma.Decimal(line.unitPrice);
      const rate  = new Prisma.Decimal(line.taxRate ?? "0");
      const { lineSubtotal, lineTax, lineTotal } = calcLine(qty, price, rate);
      await tx.salesInvoiceLine.create({
        data: {
          invoiceId: created.id,
          description: line.description,
          quantity: qty,
          unitPrice: price,
          taxRate: rate,
          lineSubtotal,
          lineTax,
          lineTotal,
          certificationLineId: line.certificationLineId ?? null,
          sortOrder: line.sortOrder ?? 0,
        },
      });
    }

    await recalcInvoiceTotals(tx as never, created.id);
    const inv = await tx.salesInvoice.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        clientContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAr(
      ctx,
      "sales_invoice.created",
      "SalesInvoice",
      inv.id,
      { projectId: inv.projectId, companyId: inv.companyId },
      { after: { number: inv.number, projectId: inv.projectId }, tx },
    );

    return inv;
  });

  return serializeInvoice(inv);
}

export async function createInvoiceFromCertification(
  input: CreateInvoiceFromCertificationInput,
  ctx: ServiceContext,
): Promise<SalesInvoiceWithLines> {
  await assertArTenantModule(ctx);
  if (!canEditArArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear facturas");
  }

  const cert = await prisma.certification.findUnique({
    where: { id: input.certificationId },
    include: {
      project: true,
      lines: { include: { wbsNode: { include: { costItem: true } } } },
    },
  });
  if (!cert) throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  if (cert.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsOperationalMutation(cert.projectId, ctx.tenantId);
  if (cert.status !== "ISSUED" && cert.status !== "APPROVED") {
    throw new ServiceError("CONFLICT", "Solo se pueden facturar certificaciones emitidas o aprobadas");
  }

  const existing = await prisma.salesInvoice.findFirst({
    where: { certificationId: input.certificationId, status: { not: "CANCELLED" } },
  });
  if (existing) {
    throw new ServiceError("CONFLICT", "Esta certificación ya tiene una factura activa");
  }

  const companyId = await resolveCompanyId(cert.projectId, ctx);

  const maxNum = await prisma.salesInvoice.aggregate({
    where: { tenantId: ctx.tenantId, companyId },
    _max: { number: true },
  });
  const number = (maxNum._max.number ?? 0) + 1;

  const taxRate = new Prisma.Decimal(input.taxRate ?? "21");

  const inv = await prisma.$transaction(async (tx) => {
    const created = await tx.salesInvoice.create({
      data: {
        tenantId: ctx.tenantId,
        companyId,
        projectId: cert.projectId,
        clientContactId: cert.project.clientContactId,
        certificationId: cert.id,
        number,
        issueDate: new Date(input.issueDate),
        dueDate: new Date(input.dueDate),
        currency: cert.project.type === "PUBLIC" ? "ARS" : "ARS",
        notes: input.notes ?? null,
        internalNotes: input.internalNotes ?? null,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    let sortIdx = 0;
    for (const line of cert.lines) {
      const qty   = line.currentQty;
      const price = line.unitSalePriceSnapshot;
      const { lineSubtotal, lineTax, lineTotal } = calcLine(qty, price, taxRate);
      await tx.salesInvoiceLine.create({
        data: {
          invoiceId: created.id,
          description: `${line.wbsNode.code} - ${line.wbsNode.name}`,
          quantity: qty,
          unitPrice: price,
          taxRate,
          lineSubtotal,
          lineTax,
          lineTotal,
          certificationLineId: line.id,
          sortOrder: sortIdx++,
        },
      });
    }

    await recalcInvoiceTotals(tx as never, created.id);
    const inv = await tx.salesInvoice.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        clientContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAr(
      ctx,
      "sales_invoice.created_from_certification",
      "SalesInvoice",
      inv.id,
      { projectId: inv.projectId, companyId: inv.companyId },
      { after: { number: inv.number, certificationId: input.certificationId }, tx },
    );

    return inv;
  });

  return serializeInvoice(inv);
}

export async function updateSalesInvoice(
  id: string,
  input: UpdateSalesInvoiceInput,
  ctx: ServiceContext,
): Promise<SalesInvoiceWithLines> {
  await assertArTenantModule(ctx);
  if (!canEditArArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar facturas");
  }
  const inv = await prisma.salesInvoice.findUnique({ where: { id } });
  if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsOperationalMutation(inv.projectId, ctx.tenantId);
  assertInvoiceEditable(inv);

  const updated = await prisma.$transaction(async (tx) => {
    const updatedInvoice = await tx.salesInvoice.update({
      where: { id },
      data: {
        issueDate:     input.issueDate ? new Date(input.issueDate) : undefined,
        dueDate:       input.dueDate   ? new Date(input.dueDate)   : undefined,
        notes:         input.notes         ?? undefined,
        internalNotes: input.internalNotes ?? undefined,
        updatedBy: ctx.actorUserId,
      },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        clientContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAr(
      ctx,
      "sales_invoice.updated",
      "SalesInvoice",
      id,
      { projectId: updatedInvoice.projectId, companyId: updatedInvoice.companyId },
      {
        after: {
          number: updatedInvoice.number,
          ...(input.issueDate !== undefined ? { issueDate: input.issueDate } : {}),
          ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
        },
        tx,
      },
    );

    return updatedInvoice;
  });

  return serializeInvoice(updated);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function issueSalesInvoice(id: string, ctx: ServiceContext): Promise<SalesInvoiceWithLines> {
  await assertArTenantModule(ctx);
  if (!canEditArArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para emitir facturas");
  }

  const invPreview = await prisma.salesInvoice.findUnique({
    where: { id },
    select: { tenantId: true, projectId: true },
  });
  if (!invPreview) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (invPreview.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsOperationalMutation(invPreview.projectId, ctx.tenantId);

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.salesInvoice.findUnique({
      where: { id },
      include: {
        lines: true,
        clientContact: { select: { legalName: true, fantasyName: true } },
      },
    });
    if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
    if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    assertInvoiceEditable(inv);

    if (inv.lines.length === 0) {
      throw new ServiceError("CONFLICT", "No se puede emitir una factura sin líneas");
    }

    const { computeDocumentFxAmounts } = await import("../finance/fx-amount.service");
    const fx = computeDocumentFxAmounts(inv.currency, inv.totalAmount, inv.fxRate);

    // Issue invoice
    const issued = await tx.salesInvoice.update({
      where: { id },
      data: {
        status: "ISSUED",
        fxRate: fx.fxRate,
        amountArs: fx.amountArs,
        updatedBy: ctx.actorUserId,
      },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        clientContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    // BR-AR-001: create Receivable 1:1
    await tx.receivable.create({
      data: {
        tenantId: inv.tenantId,
        companyId: inv.companyId,
        projectId: inv.projectId,
        clientContactId: inv.clientContactId,
        salesInvoiceId: inv.id,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        currency: inv.currency,
        originalAmount: inv.totalAmount,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    await auditAr(
      ctx,
      "sales_invoice.issued",
      "SalesInvoice",
      id,
      { projectId: issued.projectId, companyId: issued.companyId },
      { before: { status: "DRAFT" }, after: { number: issued.number, status: "ISSUED" }, tx },
    );

    return issued;
  });

  return serializeInvoice(result);
}

export async function cancelSalesInvoice(id: string, ctx: ServiceContext): Promise<SalesInvoice> {
  await assertArTenantModule(ctx);
  if (!canEditArArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para anular facturas");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const inv = await tx.salesInvoice.findUnique({ where: { id } });
    if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
    if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (inv.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "La factura ya está anulada");
    }

    const activeCollectionCount =
      inv.status === "ISSUED"
        ? await tx.collection.count({
            where: { salesInvoiceId: id, status: "CONFIRMED", tenantId: ctx.tenantId },
          })
        : 0;
    const receivable =
      inv.status === "ISSUED"
        ? await tx.receivable.findUnique({
            where: { salesInvoiceId: id },
            select: { id: true, paidAmount: true, projectId: true, companyId: true },
          })
        : null;
    assertCanCancelSalesInvoice({
      status: inv.status,
      hasReceivable: receivable != null,
      activeCollectionCount,
      receivablePaidAmount: receivable?.paidAmount ?? null,
    });

    // BR-AR-004: cascade cancel linked Receivable (optimistic lock on paidAmount)
    const receivableCancel = await tx.receivable.updateMany({
      where: {
        salesInvoiceId: id,
        status: { not: "CANCELLED" },
        ...(inv.status === "ISSUED" && receivable
          ? { paidAmount: receivable.paidAmount }
          : {}),
      },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    if (inv.status === "ISSUED" && receivable) {
      assertOptimisticRowUpdate(
        receivableCancel.count,
        "El saldo cambió mientras anulabas la factura. Revisá cobranzas e intentá de nuevo.",
      );
      await auditAr(
        ctx,
        "receivable.cancelled",
        "Receivable",
        receivable.id,
        { projectId: receivable.projectId, companyId: receivable.companyId },
        {
          after: {
            number: inv.number,
            status: "CANCELLED",
            cancelledBySalesInvoice: true,
          },
          tx,
        },
      );
    }

    const updated = await tx.salesInvoice.update({
      where: { id },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });

    await auditAr(
      ctx,
      "sales_invoice.cancelled",
      "SalesInvoice",
      id,
      { projectId: updated.projectId, companyId: updated.companyId },
      { after: { number: inv.number, status: "CANCELLED" }, tx },
    );

    return updated;
  });

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

type RawInvoiceListRow = SalesInvoice & {
  clientContact: { legalName: string; fantasyName: string | null };
};

function serializeInvoiceListRow(inv: RawInvoiceListRow): ProjectSalesInvoiceListRow {
  return {
    ...inv,
    code: `FAC-${String(inv.number).padStart(5, "0")}`,
    clientName: inv.clientContact.fantasyName ?? inv.clientContact.legalName,
    subtotal: inv.subtotal.toString(),
    taxAmount: inv.taxAmount.toString(),
    totalAmount: inv.totalAmount.toString(),
  };
}

type RawInvoice = SalesInvoice & {
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
    certificationLineId: string | null;
    sortOrder: number;
  }>;
  clientContact: { legalName: string; fantasyName: string | null };
};

function serializeInvoice(inv: RawInvoice): SalesInvoiceWithLines {
  return {
    ...inv,
    code: `FAC-${String(inv.number).padStart(5, "0")}`,
    clientName: inv.clientContact.fantasyName ?? inv.clientContact.legalName,
    subtotal: inv.subtotal.toString(),
    taxAmount: inv.taxAmount.toString(),
    totalAmount: inv.totalAmount.toString(),
    lines: inv.lines.map((l) => ({
      id: l.id,
      invoiceId: l.invoiceId,
      description: l.description,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice.toString(),
      taxRate: l.taxRate.toString(),
      lineSubtotal: l.lineSubtotal.toString(),
      lineTax: l.lineTax.toString(),
      lineTotal: l.lineTotal.toString(),
      certificationLineId: l.certificationLineId,
      sortOrder: l.sortOrder,
    })),
  };
}
