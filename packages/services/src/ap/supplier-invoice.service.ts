import { Prisma, prisma, SupplierInvoice } from "@bloqer/database";
import type { CreateSupplierInvoiceInput, UpdateSupplierInvoiceInput } from "@bloqer/validators";
import { auditAp } from "./ap-audit";
import { assertInvoiceLetterOnIssue } from "../finance/invoice-letter-guards";
import { resolveSuggestedApInvoiceLetter } from "../finance/resolve-suggested-invoice-letter";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { isCrossCompany } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";
import { assertCanCancelSupplierInvoice } from "./supplier-invoice-cancel-guards";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { resolvePagination } from "../finance/pagination";
import { canMutateApForScope, canViewApProjectArea, canViewCompanyAp } from "./ap-access";
import { notifyPayableReadyToPay } from "./ap-notifications.service";
import { calcLine, recalcSupplierInvoiceTotals } from "./supplier-invoice-calc.service";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { getCompanyProcurementSettingsForProject } from "../procurement/company-procurement-settings.service";
import { assertProjectApDirectSpendAllowed } from "../procurement/procurement-policy.service";
import { assertWbsLineForProject } from "../procurement/procurement-wbs";
import { ensureDraftJournalFromSupplierInvoice } from "../accounting/accounting-auto-draft.service";
import {
  assertJournalAllowsOperationalCancel,
  cancelDraftJournalOnOperationalCancel,
} from "../accounting/accounting-cancel-sync.service";

const PO_AP_LINKABLE_STATUSES = ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] as const;

/** Shared with registerApExpense — OC must be confirmed (or later receipt states) before AP link. */
export function assertPurchaseOrderLinkableForAp(status: string): void {
  if (status === "CANCELLED") {
    throw new ServiceError("CONFLICT", "No se puede vincular a una orden de compra anulada");
  }
  if (!PO_AP_LINKABLE_STATUSES.includes(status as (typeof PO_AP_LINKABLE_STATUSES)[number])) {
    throw new ServiceError(
      "CONFLICT",
      "La orden debe estar confirmada al proveedor antes de vincular una factura",
    );
  }
}

// ─── View types ───────────────────────────────────────────────────────────────

export type SupplierInvoiceLineView = {
  id: string;
  invoiceId: string;
  wbsNodeId: string | null;
  purchaseOrderLineId: string | null;
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
  subcontractCertificationCode: string | null;
  subcontractId: string | null;
};

/** Payable snapshot for invoice lists (payment status lives on Payable, not the document). */
export type SupplierInvoiceListPayable = {
  id: string;
  status: string;
} | null;

// ─── Guard ────────────────────────────────────────────────────────────────────

/** [D-055] Project invoices require WBS on every line; corporate invoices must not carry WBS. */
export async function assertSupplierInvoiceLinesWbs(
  projectId: string | null,
  lines: Array<{ wbsNodeId?: string | null }>,
  tenantId: string,
): Promise<void> {
  if (!projectId) {
    for (const line of lines) {
      if (line.wbsNodeId) {
        throw new ServiceError(
          "CONFLICT",
          "Las facturas corporativas (sin proyecto) no llevan partida EDT",
        );
      }
    }
    return;
  }
  for (const line of lines) {
    if (!line.wbsNodeId) {
      throw new ServiceError(
        "VALIDATION",
        "Cada línea de factura de proyecto debe imputar a una partida EDT",
      );
    }
    await assertWbsLineForProject(line.wbsNodeId, projectId, tenantId);
  }
}

/**
 * [D-066] When a line references a PO line, it must belong to the linked OC (same tenant/project).
 * Corporate invoices cannot carry purchaseOrderLineId.
 */
export async function assertSupplierInvoiceLinesPoLink(
  projectId: string | null,
  purchaseOrderId: string | null | undefined,
  lines: Array<{ purchaseOrderLineId?: string | null; wbsNodeId?: string | null }>,
  tenantId: string,
): Promise<void> {
  const hasPoLineRef = lines.some((l) => l.purchaseOrderLineId);
  if (!hasPoLineRef) return;

  if (!projectId) {
    throw new ServiceError(
      "CONFLICT",
      "Las facturas corporativas no pueden vincular líneas a una orden de compra",
    );
  }
  if (!purchaseOrderId) {
    throw new ServiceError(
      "CONFLICT",
      "Para vincular líneas a OC, la factura debe tener orden de compra",
    );
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: {
      id: true,
      tenantId: true,
      projectId: true,
      lines: { select: { id: true, wbsNodeId: true } },
    },
  });
  if (!po) throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  if (po.tenantId !== tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (po.projectId !== projectId) {
    throw new ServiceError("CONFLICT", "La orden de compra no pertenece al mismo proyecto");
  }

  const poLineById = new Map(po.lines.map((l) => [l.id, l]));
  for (const line of lines) {
    if (!line.purchaseOrderLineId) continue;
    const poLine = poLineById.get(line.purchaseOrderLineId);
    if (!poLine) {
      throw new ServiceError(
        "CONFLICT",
        "La línea de OC no pertenece a la orden de compra vinculada",
      );
    }
    if (line.wbsNodeId && poLine.wbsNodeId && line.wbsNodeId !== poLine.wbsNodeId) {
      throw new ServiceError(
        "CONFLICT",
        "La partida EDT de la línea no coincide con la de la línea de OC",
      );
    }
  }
}

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
      subcontractCertification: {
        select: {
          number: true,
          subcontractId: true,
        },
      },
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
  search?: string;
  sortDir?: "asc" | "desc";
};

export type ProjectSupplierInvoiceListRow = Omit<SupplierInvoiceView, "lines"> & {
  payable: SupplierInvoiceListPayable;
};

/** Parse "FP-00012", "fp-12", or "12" into invoice number for list search. */
function parseSupplierInvoiceNumberSearch(search: string): number | undefined {
  const trimmed = search.trim();
  if (!trimmed) return undefined;
  const match = /^(?:FP-?)?0*(\d+)$/i.exec(trimmed);
  if (!match?.[1]) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

function supplierInvoiceSearchWhere(search: string): Prisma.SupplierInvoiceWhereInput {
  const numberEq = parseSupplierInvoiceNumberSearch(search);
  return {
    OR: [
      { supplierContact: { legalName: { contains: search, mode: "insensitive" } } },
      { supplierContact: { fantasyName: { contains: search, mode: "insensitive" } } },
      ...(numberEq !== undefined ? [{ number: numberEq }] : []),
    ],
  };
}

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

  const search = filters?.search?.trim();
  const where: Prisma.SupplierInvoiceWhereInput = {
    projectId,
    tenantId: ctx.tenantId,
    ...(search ? supplierInvoiceSearchWhere(search) : {}),
  };

  const issueDir = filters?.sortDir === "asc" ? "asc" : "desc";

  const [invoices, total] = await Promise.all([
    prisma.supplierInvoice.findMany({
      where,
      include: {
        supplierContact: { select: { legalName: true, fantasyName: true } },
        payable: { select: { id: true, status: true } },
      },
      orderBy: [{ issueDate: issueDir }, { number: issueDir }, { id: issueDir }],
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
  search?:            string;
  sortDir?:           "asc" | "desc";
  page?:              number;
  pageSize?:          number;
};

export type CompanySupplierInvoiceListRow = Omit<SupplierInvoiceView, "lines"> & {
  payable: SupplierInvoiceListPayable;
};

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

  const search = filters?.search?.trim();
  const where: Prisma.SupplierInvoiceWhereInput = {
    tenantId:  ctx.tenantId,
    projectId: null,
    // SupplierInvoice.companyId es NOT NULL → scope directo por empresa.
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
    ...(search ? supplierInvoiceSearchWhere(search) : {}),
  };

  const issueDir = filters?.sortDir === "asc" ? "asc" : "desc";

  const [invoices, total] = await Promise.all([
    prisma.supplierInvoice.findMany({
      where,
      include: {
        supplierContact: { select: { legalName: true, fantasyName: true } },
        payable: { select: { id: true, status: true } },
      },
      orderBy: [{ issueDate: issueDir }, { number: issueDir }, { id: issueDir }],
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
      subcontractCertification: {
        select: {
          number: true,
          subcontractId: true,
        },
      },
    },
  });
  if (!inv) throw new ServiceError("NOT_FOUND", "Factura de proveedor no encontrada");
  if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (inv.projectId !== null) {
    throw new ServiceError("FORBIDDEN", "Esta factura está asignada a un proyecto; usá el espacio de trabajo del proyecto");
  }
  if (isCrossCompany(inv.companyId, ctx)) {
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

  const projectId = input.projectId ?? null;
  if (!canMutateApForScope(ctx.roles, projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear facturas de proveedor");
  }

  if (projectId) {
    await assertProjectAllowsOperationalMutation(projectId, ctx.tenantId);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { tenantId: true, companyId: true },
    });
    if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
    if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (isCrossCompany(project.companyId, ctx)) {
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
    assertPurchaseOrderLinkableForAp(po.status);
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

  let invoiceTotal = new Prisma.Decimal(0);
  for (const line of input.lines) {
    const qty = new Prisma.Decimal(line.quantity);
    const price = new Prisma.Decimal(line.unitPrice);
    const rate = new Prisma.Decimal(line.taxRate ?? "0");
    invoiceTotal = invoiceTotal.plus(calcLine(qty, price, rate).lineTotal);
  }
  const estimatedFx = computeDocumentFxAmounts(
    input.currency ?? "ARS",
    invoiceTotal,
    input.fxRate ? new Prisma.Decimal(input.fxRate) : null,
  );
  if (projectId && !input.purchaseOrderId) {
    const settings = await getCompanyProcurementSettingsForProject(projectId, ctx);
    assertProjectApDirectSpendAllowed(settings, estimatedFx.amountArs, ctx);
  }

  await assertSupplierInvoiceLinesWbs(projectId, input.lines, ctx.tenantId);
  await assertSupplierInvoiceLinesPoLink(
    projectId,
    input.purchaseOrderId,
    input.lines,
    ctx.tenantId,
  );

  const companyId = await resolveCompanyIdForAp(projectId, ctx);

  const suggestedLetter =
    input.invoiceLetter ??
    (await resolveSuggestedApInvoiceLetter({
      companyId,
      supplierContactId: input.supplierContactId,
      tenantId: ctx.tenantId,
    }));

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
        invoiceLetter:     suggestedLetter,
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
          wbsNodeId:   line.wbsNodeId ?? null,
          purchaseOrderLineId: line.purchaseOrderLineId ?? null,
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

    const inv = await tx.supplierInvoice.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAp(
      ctx,
      "supplier_invoice.created",
      "SupplierInvoice",
      inv.id,
      { projectId: inv.projectId, companyId: inv.companyId },
      { after: { number: inv.number, projectId: inv.projectId }, tx },
    );

    return inv;
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

  const existing = await prisma.supplierInvoice.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (!canMutateApForScope(ctx.roles, existing.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar facturas de proveedor");
  }
  if (projectScopeId !== undefined && existing.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a este proyecto");
  }
  if (existing.projectId) {
    await assertProjectAllowsOperationalMutation(existing.projectId, ctx.tenantId);
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
    assertPurchaseOrderLinkableForAp(po.status);
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

  if (input.lines) {
      await assertSupplierInvoiceLinesWbs(existing.projectId, input.lines, ctx.tenantId);
      const poId =
        input.purchaseOrderId !== undefined ? input.purchaseOrderId : existing.purchaseOrderId;
      await assertSupplierInvoiceLinesPoLink(
        existing.projectId,
        poId,
        input.lines,
        ctx.tenantId,
      );
    } else if (
      input.purchaseOrderId !== undefined &&
      input.purchaseOrderId !== existing.purchaseOrderId
    ) {
      // Header PO retarget without rewriting lines: clear stale D-066 FKs or reject if new PO set.
      if (input.purchaseOrderId !== null) {
        const existingLines = await prisma.supplierInvoiceLine.findMany({
          where: { invoiceId: id },
          select: { purchaseOrderLineId: true, wbsNodeId: true },
        });
        const linked = existingLines.filter((l) => l.purchaseOrderLineId);
        if (linked.length > 0) {
          throw new ServiceError(
            "CONFLICT",
            "Para cambiar la OC vinculada, reenviá las líneas de la factura (los ítems apuntan a otra orden).",
          );
        }
      }
    }

  const inv = await prisma.$transaction(async (tx) => {
    const nextPurchaseOrderId =
      input.purchaseOrderId !== undefined ? input.purchaseOrderId : undefined;

    // Claim DRAFT so concurrent issue cannot leave an ISSUED invoice with rewritten lines.
    const headerClaim = await tx.supplierInvoice.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "DRAFT" },
      data: {
        supplierContactId: input.supplierContactId,
        issueDate:       input.issueDate ? new Date(input.issueDate) : undefined,
        dueDate:         input.dueDate   ? new Date(input.dueDate)   : undefined,
        notes:           input.notes,
        internalNotes:   input.internalNotes,
        purchaseOrderId: nextPurchaseOrderId,
        fxRate: input.fxRate ? new Prisma.Decimal(input.fxRate) : undefined,
        ...(input.invoiceLetter !== undefined ? { invoiceLetter: input.invoiceLetter } : {}),
        updatedBy:       ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      headerClaim.count,
      "La factura ya no está en borrador. Recargá e intentá de nuevo.",
    );

    // Clearing OC header without rewriting lines must drop stale D-066 FKs.
    if (nextPurchaseOrderId === null && !input.lines) {
      await tx.supplierInvoiceLine.updateMany({
        where: { invoiceId: id },
        data: { purchaseOrderLineId: null },
      });
    }

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
            wbsNodeId: line.wbsNodeId ?? null,
            purchaseOrderLineId: line.purchaseOrderLineId ?? null,
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

    const inv = await tx.supplierInvoice.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAp(
      ctx,
      "supplier_invoice.updated",
      "SupplierInvoice",
      id,
      { projectId: inv.projectId, companyId: inv.companyId },
      { after: { number: inv.number }, tx },
    );

    return inv;
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

  const invPreview = await prisma.supplierInvoice.findUnique({
    where: { id },
    select: { tenantId: true, projectId: true, companyId: true, purchaseOrderId: true },
  });
  if (!invPreview) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (invPreview.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(invPreview.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a la empresa activa");
  }
  if (!canMutateApForScope(ctx.roles, invPreview.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para emitir facturas de proveedor");
  }
  if (invPreview.projectId) {
    await assertProjectAllowsOperationalMutation(invPreview.projectId, ctx.tenantId);
  }

  const directSpendSettings =
    invPreview.projectId && !invPreview.purchaseOrderId
      ? await getCompanyProcurementSettingsForProject(invPreview.projectId, ctx)
      : null;

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.supplierInvoice.findUnique({
      where: { id },
      include: {
        supplierContact: { select: { country: true } },
        company: { select: { country: true } },
      },
    });
    if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
    if (inv.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (projectScopeId !== undefined && inv.projectId !== projectScopeId) {
      throw new ServiceError("FORBIDDEN", "La factura no pertenece a este proyecto");
    }
    if (inv.status !== "DRAFT") {
      throw new ServiceError("CONFLICT", "Solo se pueden emitir facturas en estado Borrador");
    }

    assertInvoiceLetterOnIssue({
      invoiceLetter: inv.invoiceLetter,
      companyCountry: inv.company.country,
      counterpartyCountry: inv.supplierContact.country,
      documentLabel: "factura de proveedor",
    });

    const lines = await tx.supplierInvoiceLine.findMany({
      where: { invoiceId: id },
      select: { wbsNodeId: true },
    });
    if (lines.length === 0) {
      throw new ServiceError("CONFLICT", "La factura debe tener al menos una línea");
    }
    await assertSupplierInvoiceLinesWbs(inv.projectId, lines, ctx.tenantId);

    // Re-fetch totals
    await recalcSupplierInvoiceTotals(tx, id);
    const refreshed = await tx.supplierInvoice.findUniqueOrThrow({ where: { id } });
    if (refreshed.totalAmount.lessThanOrEqualTo(0)) {
      throw new ServiceError("CONFLICT", "El total de la factura debe ser mayor a 0");
    }

    const { computeDocumentFxAmounts } = await import("../finance/fx-amount.service");
    const fx = computeDocumentFxAmounts(refreshed.currency, refreshed.totalAmount, refreshed.fxRate);

    // Re-gate direct AP spend on issue ([BR-APR-005]) — create alone is not enough if lines were edited.
    if (refreshed.projectId && !refreshed.purchaseOrderId) {
      const settings =
        directSpendSettings ??
        (await getCompanyProcurementSettingsForProject(refreshed.projectId, ctx));
      assertProjectApDirectSpendAllowed(settings, fx.amountArs, ctx);
    }

    const issued = await tx.supplierInvoice.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "DRAFT" },
      data: {
        status: "ISSUED",
        fxRate: fx.fxRate,
        amountArs: fx.amountArs,
        updatedBy: ctx.actorUserId,
      },
    });
    if (issued.count !== 1) {
      throw new ServiceError("CONFLICT", "La factura ya no está en borrador");
    }

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

    const result = await tx.supplierInvoice.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAp(
      ctx,
      "supplier_invoice.issued",
      "SupplierInvoice",
      id,
      { projectId: result.projectId, companyId: result.companyId },
      { after: { number: result.number, status: "ISSUED" }, tx },
    );

    return result;
  });

  await ensureDraftJournalFromSupplierInvoice(result.id, ctx);

  if (result.projectId) {
    const payable = await prisma.payable.findUnique({
      where: { supplierInvoiceId: result.id },
      select: { id: true },
    });
    let purchaseOrderCode: string | null = null;
    if (result.purchaseOrderId) {
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: result.purchaseOrderId },
        select: { number: true },
      });
      if (po) purchaseOrderCode = `OC-${String(po.number).padStart(3, "0")}`;
    }
    if (payable) {
      await notifyPayableReadyToPay({
        ctx,
        supplierInvoiceId: result.id,
        payableId: payable.id,
        projectId: result.projectId,
        companyId: result.companyId,
        invoiceNumber: result.number,
        purchaseOrderId: result.purchaseOrderId,
        purchaseOrderCode,
        amountLabel: `${serializeMoneyDecimal(result.totalAmount)} ${result.currency}`,
      }).catch(() => undefined);
    }
  }

  return serializeInvoice(result);
}

export async function cancelSupplierInvoice(
  id: string,
  ctx: ServiceContext,
  /** When set, rejects corporate invoices and cross-project cancel (project workspace). */
  projectScopeId?: string,
): Promise<SupplierInvoiceView> {
  await assertApTenantModule(ctx);

  const invPreview = await prisma.supplierInvoice.findUnique({
    where: { id },
    select: { tenantId: true, projectId: true, companyId: true, status: true },
  });
  if (!invPreview) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (invPreview.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(invPreview.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a la empresa activa");
  }
  if (!canMutateApForScope(ctx.roles, invPreview.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar facturas de proveedor");
  }
  if (projectScopeId !== undefined && invPreview.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a este proyecto");
  }

  const glParams = {
    companyId: invPreview.companyId,
    sourceType: "SUPPLIER_INVOICE" as const,
    sourceId: id,
    sourceLabel: "la factura de proveedor",
  };

  if (invPreview.status === "CANCELLED") {
    await cancelDraftJournalOnOperationalCancel(ctx, glParams);
    throw new ServiceError("CONFLICT", "La factura ya está cancelada");
  }

  if (invPreview.status === "ISSUED") {
    await assertJournalAllowsOperationalCancel(ctx, glParams);
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
      const payable = await tx.payable.findUnique({
        where: { supplierInvoiceId: id },
        select: { id: true, paidAmount: true, projectId: true, companyId: true },
      });
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
        await auditAp(
          ctx,
          "payable.cancelled",
          "Payable",
          payable.id,
          { projectId: payable.projectId, companyId: payable.companyId },
          {
            after: {
              number: inv.number,
              status: "CANCELLED",
              cancelledBySupplierInvoice: true,
            },
            tx,
          },
        );
      }
    }

    const flipped = await tx.supplierInvoice.updateMany({
      where: { id, tenantId: ctx.tenantId, status: inv.status },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La factura cambió de estado mientras la cancelabas. Recargá e intentá de nuevo.",
    );

    const result = await tx.supplierInvoice.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        supplierContact: { select: { legalName: true, fantasyName: true } },
      },
    });

    await auditAp(
      ctx,
      "supplier_invoice.cancelled",
      "SupplierInvoice",
      id,
      { projectId: result.projectId, companyId: result.companyId },
      { after: { number: inv.number, status: "CANCELLED" }, tx },
    );

    return result;
  });

  await cancelDraftJournalOnOperationalCancel(ctx, glParams);

  return serializeInvoice(result);
}

// ─── Serialization ────────────────────────────────────────────────────────────

type RawInvoice = SupplierInvoice & {
  lines: Array<{
    id: string;
    invoiceId: string;
    wbsNodeId: string | null;
    purchaseOrderLineId: string | null;
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
  subcontractCertification?: { number: number; subcontractId: string } | null;
};

type RawInvoiceListRow = SupplierInvoice & {
  supplierContact: { legalName: string; fantasyName: string | null };
  payable?: { id: string; status: string } | null;
};

function serializeInvoiceListRow(inv: RawInvoiceListRow): CompanySupplierInvoiceListRow {
  return {
    ...inv,
    subtotal:    serializeMoneyDecimal(inv.subtotal),
    taxAmount:   serializeMoneyDecimal(inv.taxAmount),
    totalAmount: serializeMoneyDecimal(inv.totalAmount),
    code:        `FP-${String(inv.number).padStart(5, "0")}`,
    supplierName: inv.supplierContact.fantasyName ?? inv.supplierContact.legalName,
    subcontractCertificationCode: null,
    subcontractId: null,
    payable: inv.payable ? { id: inv.payable.id, status: inv.payable.status } : null,
  };
}

function serializeInvoice(inv: RawInvoice): SupplierInvoiceView {
  return {
    ...inv,
    subtotal:    serializeMoneyDecimal(inv.subtotal),
    taxAmount:   serializeMoneyDecimal(inv.taxAmount),
    totalAmount: serializeMoneyDecimal(inv.totalAmount),
    code:        `FP-${String(inv.number).padStart(5, "0")}`,
    supplierName: inv.supplierContact.fantasyName ?? inv.supplierContact.legalName,
    subcontractCertificationCode: inv.subcontractCertification
      ? `CERT-SC-${String(inv.subcontractCertification.number).padStart(3, "0")}`
      : null,
    subcontractId: inv.subcontractCertification?.subcontractId ?? null,
    lines: inv.lines.map((l) => ({
      id:          l.id,
      invoiceId:   l.invoiceId,
      wbsNodeId:   l.wbsNodeId,
      purchaseOrderLineId: l.purchaseOrderLineId,
      description: l.description,
      quantity:    l.quantity.toString(),
      unitPrice:   serializeMoneyDecimal(l.unitPrice),
      taxRate:     l.taxRate.toString(),
      lineSubtotal: serializeMoneyDecimal(l.lineSubtotal),
      lineTax:     serializeMoneyDecimal(l.lineTax),
      lineTotal:   serializeMoneyDecimal(l.lineTotal),
      sortOrder:   l.sortOrder,
    })),
  };
}
