import { Prisma, prisma, SalesInvoice, SalesInvoiceStatus } from "@bloqer/database";
import { createSalesInvoiceSchema, updateSalesInvoiceSchema, createInvoiceFromCertificationSchema } from "@bloqer/validators";
import {
  requireCertificationAccess,
  loadCertificationRecord,
} from "../certification/certification-scope";
import {
  certificationInvoiceStatusSelect,
  deriveCertificationInvoiceStatus,
} from "./certification-invoice-status";
import { DEFAULT_IIBB_PERCEPTION_RATE_PCT } from "@bloqer/domain";
import type {
  CreateSalesInvoiceInput,
  CreateInvoiceFromCertificationInput,
  UpdateSalesInvoiceInput,
} from "@bloqer/validators";
import { auditAr } from "./ar-audit";
import { arInvoiceParents, arReceivableParents, assertArInvoiceParents, assertArReceivableParents, arCancellationReason, assertArDateRange, parseArInput, stripArParents, assertArTransactionModules } from "./ar-integrity";
import { _lockCertificationProject } from "../certification/certification-calc.service";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import { assertCanCancelSalesInvoice } from "./sales-invoice-cancel-guards";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import {
  computeObligationBalanceDue,
  normalizeObligationBalanceDue,
} from "../finance/obligation-balance";
import { assertInvoiceLetterOnIssue } from "../finance/invoice-letter-guards";
import { assertInvoiceLetterTaxConsistencyOnIssue } from "../finance/invoice-letter-tax-guards";
import { assertNonnegativeInvoiceTaxes } from "../finance/invoice-tax-guards";
import { resolveSuggestedArInvoiceLetter } from "../finance/resolve-suggested-invoice-letter";
import { assertArTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import {
  canEditArArea,
  canMutateArForScope,
  canViewArProjectArea,
  canViewCompanyAr,
} from "./ar-access";
import { resolvePagination } from "../finance/pagination";
import { calcLine, lockSalesInvoiceRow, recalcInvoiceTotals } from "./sales-invoice-calc.service";
import { assertManualInvoiceHasNoCertificationLinks } from "./manual-invoice-guards";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import {
  indexStoredDocumentLines,
  resolveInvoiceLineMoney,
  parseDiscountPct,
} from "../finance/invoice-line-money";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeRatePctDecimal,
  serializeUnitPriceDecimal,
} from "../finance/money-decimal";
import { isCrossCompany } from "../company-scope";
import {
  assertProjectAllowsOperationalMutation,
  lockProjectForOperationalMutation,
} from "../project/project-operational-guard";
import { lockProjectForMutation } from "../project/project-write-lock";
import { requireProjectAccess, requireProjectAccessIfPresent } from "../security/access";

import { ensureDraftJournalFromSalesInvoice } from "../accounting/accounting-auto-draft.service";
import {
  assertJournalAllowsOperationalCancel,
  cancelDraftJournalOnOperationalCancel,
} from "../accounting/accounting-cancel-sync.service";
import { notifyReceivableReadyToCollect } from "./ar-notifications.service";
import { assertContactRoleInTenant } from "../contact/assert-contact-role";
import {
  classFieldsForSalesInvoice,
  parseSalesInvoiceClassFilter,
  salesInvoiceClassWhere,
  type FinancialClassFields,
} from "../finance/document-class.service";

// ─── View types ───────────────────────────────────────────────────────────────

export type SalesInvoiceLineView = {
  id: string;
  invoiceId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  discountPct: string;
  lineSubtotal: string;
  lineTax: string;
  lineTotal: string;
  certificationLineId: string | null;
  sortOrder: number;
};

export type SalesInvoiceWithLines = Omit<
  SalesInvoice,
  "subtotal" | "taxAmount" | "totalAmount" | "iibbPerceptionRate" | "iibbPerceptionAmount" | "fxRate" | "amountArs"
> & {
  fxRate: string;
  amountArs: string;
  subtotal: string;
  taxAmount: string;
  iibbPerceptionRate: string;
  iibbPerceptionAmount: string;
  totalAmount: string;
  code: string;
  lines: SalesInvoiceLineView[];
  clientName: string;
} & FinancialClassFields;

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
  /** null = corporate; string = that project; omitted = entity scope with normal access checks. */
  projectScopeId?: string | null,
): Promise<SalesInvoiceWithLines> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas");
  }
  const inv = await prisma.salesInvoice.findUnique({
    where: { id },
    include: {
      ...arInvoiceParents,
      lines: { orderBy: { sortOrder: "asc" } },
      clientContact: { select: { id: true, tenantId: true, legalName: true, fantasyName: true } },
    },
  });
  if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (inv.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(inv.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a la empresa activa");
  }
  if (inv.projectId === null && !canViewCompanyAr(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas a nivel empresa");
  }
  if (projectScopeId !== undefined && inv.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a este proyecto");
  }
  await requireProjectAccessIfPresent(inv.projectId, ctx);
  assertArInvoiceParents(inv, ctx);
  return serializeInvoice(inv);
}

/**
 * Corporate sales invoice by id: tenant-safe and enforces `projectId === null`.
 * Use from `/finanzas/facturas/...` only (not project workspace).
 */
export async function getCompanySalesInvoiceById(
  id: string,
  ctx: ServiceContext,
): Promise<SalesInvoiceWithLines> {
  await assertArTenantModule(ctx);
  if (!canViewCompanyAr(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas de venta a nivel empresa");
  }
  const inv = await prisma.salesInvoice.findUnique({
    where: { id },
    include: {
      ...arInvoiceParents,
      lines: { orderBy: { sortOrder: "asc" } },
      clientContact: { select: { id: true, tenantId: true, legalName: true, fantasyName: true } },
    },
  });
  if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (inv.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (inv.projectId !== null) {
    throw new ServiceError(
      "FORBIDDEN",
      "Esta factura está asignada a un proyecto; usá el espacio de trabajo del proyecto",
    );
  }
  if (isCrossCompany(inv.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a la empresa activa");
  }
  assertArInvoiceParents(inv, ctx);
  return serializeInvoice(inv);
}

export async function getActiveInvoiceForCertification(
  certificationId: string,
  ctx: ServiceContext,
): Promise<{
  id: string;
  code: string;
  status: SalesInvoiceStatus;
  currency: string;
  receivableId: string | null;
  canCollect: boolean;
  isSettled: boolean;
  collectionStatusAvailable: boolean;
} | null> {
  if (!canViewArProjectArea(ctx.roles)) return null;
  if (!(await getTenantModuleGate(ctx)).isEnabled("AR")) return null;
  let cert;
  try {
    cert = await requireCertificationAccess(certificationId, ctx);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "NOT_FOUND") return null;
    throw error;
  }
  const inv = await prisma.salesInvoice.findFirst({
    where: {
      certificationId,
      tenantId: ctx.tenantId,
      documentKind: "INVOICE",
      status: { not: "CANCELLED" },
    },
    select: certificationInvoiceStatusSelect,
  });
  if (!inv) return null;
  if (isCrossCompany(inv.companyId, ctx))
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a la empresa activa");
  if (
    inv.projectId !== cert.projectId ||
    (cert.companyId && inv.companyId !== cert.companyId) ||
    (cert.budget.companyId && inv.companyId !== cert.budget.companyId) ||
    (cert.project.companyId && inv.companyId !== cert.project.companyId) ||
    inv.company.tenantId !== ctx.tenantId ||
    inv.clientContact.tenantId !== ctx.tenantId
  )
    throw new ServiceError(
      "CONFLICT",
      "Las relaciones de la factura y certificación son inconsistentes",
    );
  return {
    id: inv.id,
    code: "FAC-" + String(inv.number).padStart(5, "0"),
    status: inv.status,
    currency: inv.currency,
    ...deriveCertificationInvoiceStatus(inv),
  };
}

export type ProjectSalesInvoiceListFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  /** Derived document class filter ([D-102]). */
  class?: string;
  /** Fiscal document kind filter ([D-115]). */
  documentKind?: "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE";
};

export type ProjectSalesInvoiceListRow = Omit<SalesInvoiceWithLines, "lines">;

export type CompanySalesInvoiceListFilters = Omit<ProjectSalesInvoiceListFilters, "class"> & {
  status?: SalesInvoiceStatus;
  includeCancelled?: boolean;
};

export type CompanySalesInvoiceListRow = ProjectSalesInvoiceListRow & {
  receivable: { id: string; status: string; balanceDue: string } | null;
};

/** Parse "FAC-12", "NC-00003", "ND-1", or bare digits. */
function parseSalesInvoiceNumberSearch(
  search: string,
): { number: number; documentKind?: "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE" } | undefined {
  const trimmed = search.trim();
  if (!trimmed) return undefined;
  const match = /^(?:(FAC|NC|ND)-?)?0*(\d+)$/i.exec(trimmed);
  if (!match?.[2]) return undefined;
  const n = Number(match[2]);
  if (!Number.isFinite(n)) return undefined;
  const prefix = match[1]?.toUpperCase();
  const documentKind =
    prefix === "NC"
      ? ("CREDIT_NOTE" as const)
      : prefix === "ND"
        ? ("DEBIT_NOTE" as const)
        : prefix === "FAC"
          ? ("INVOICE" as const)
          : undefined;
  return { number: n, documentKind };
}

function salesInvoiceSearchWhere(search: string): Prisma.SalesInvoiceWhereInput {
  const parsed = parseSalesInvoiceNumberSearch(search);
  return {
    OR: [
      { clientContact: { legalName: { contains: search, mode: "insensitive" } } },
      { clientContact: { fantasyName: { contains: search, mode: "insensitive" } } },
      ...(parsed
        ? [
            {
              number: parsed.number,
              ...(parsed.documentKind ? { documentKind: parsed.documentKind } : {}),
            },
          ]
        : []),
    ],
  };
}

export async function listInvoicesByProject(
  projectId: string,
  ctx: ServiceContext,
  filters?: ProjectSalesInvoiceListFilters,
): Promise<{ data: ProjectSalesInvoiceListRow[]; total: number }> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas");
  }
  await requireProjectAccess(projectId, ctx);

  const { skip, take } = resolvePagination({
    page: filters?.page,
    pageSize: filters?.pageSize,
  });

  const search = filters?.search?.trim();
  const classCode = parseSalesInvoiceClassFilter(filters?.class);
  const where: Prisma.SalesInvoiceWhereInput = {
    projectId,
    tenantId: ctx.tenantId,
    status: { not: "CANCELLED" },
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    ...(classCode ? salesInvoiceClassWhere(classCode) : {}),
    ...(filters?.documentKind ? { documentKind: filters.documentKind } : {}),
    ...(search ? salesInvoiceSearchWhere(search) : {}),
  };

  const [invoices, total] = await Promise.all([
    prisma.salesInvoice.findMany({
      where,
      include: {
        ...arInvoiceParents,
        clientContact: { select: { id: true, tenantId: true, legalName: true, fantasyName: true } },
      },
      orderBy: [{ number: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.salesInvoice.count({ where }),
  ]);
  invoices.forEach((invoice) => assertArInvoiceParents(invoice, ctx));
  return { data: invoices.map(serializeInvoiceListRow), total };
}

/** Corporate documents include drafts and NCs, which do not have a Receivable. */
export async function listCompanySalesInvoices(
  ctx: ServiceContext,
  filters?: CompanySalesInvoiceListFilters,
): Promise<{ data: CompanySalesInvoiceListRow[]; total: number }> {
  await assertArTenantModule(ctx);
  if (!canViewCompanyAr(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas de venta a nivel empresa");
  }
  const { skip, take } = resolvePagination(filters ?? {});
  const search = filters?.search?.trim();
  const where: Prisma.SalesInvoiceWhereInput = {
    tenantId: ctx.tenantId,
    projectId: null,
    // SalesInvoice.companyId is NOT NULL.
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    ...(filters?.status ? { status: filters.status } :
      filters?.includeCancelled ? {} : { status: { not: "CANCELLED" } }),
    ...(filters?.documentKind ? { documentKind: filters.documentKind } : {}),
    ...(search ? salesInvoiceSearchWhere(search) : {}),
  };
  const [invoices, total] = await Promise.all([
    prisma.salesInvoice.findMany({
      where,
      include: {
        ...arInvoiceParents,
        clientContact: { select: { id: true, tenantId: true, legalName: true, fantasyName: true } },
        receivable: { include: arReceivableParents },
      },
      orderBy: [{ issueDate: "desc" }, { number: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.salesInvoice.count({ where }),
  ]);
  return {
    total,
    data: invoices.map((invoice) => {
      assertArInvoiceParents(invoice, ctx);
      if (invoice.receivable) assertArReceivableParents(invoice.receivable, ctx);
      return {
        ...serializeInvoiceListRow(invoice),
        receivable: invoice.receivable ? {
          id: invoice.receivable.id,
          status: invoice.receivable.status,
          balanceDue: serializeMoneyDecimal(normalizeObligationBalanceDue(computeObligationBalanceDue(
            invoice.receivable.originalAmount, invoice.receivable.paidAmount, invoice.receivable.creditedAmount,
          ))),
        } : null,
      };
    }),
  };
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
  await requireProjectAccess(projectId, ctx);

  return prisma.salesInvoice.count({
    where: {
      projectId,
      tenantId: ctx.tenantId,
      status: "ISSUED",
      documentKind: "INVOICE",
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    },
  });
}

/** All writers of the company INVOICE series take this lock after the project lock, when present. */
export async function lockInvoiceNumberCompany(
  tx: Prisma.TransactionClient,
  companyId: string,
  tenantId: string,
  requireActive = true,
) {
  await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} AND "tenantId" = ${tenantId} FOR NO KEY UPDATE`;
  const company = await tx.company.findFirst({
    where: { id: companyId, tenantId, ...(requireActive ? { status: "ACTIVE" as const } : {}) },
    select: { id: true },
  });
  if (!company)
    throw new ServiceError("CONFLICT", "La empresa no está activa para crear la factura");
}

async function resolveCompanyId(
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
  if (!company) throw new ServiceError("CONFLICT", "No hay empresa activa para emitir la factura");
  return company.id;
}

/** Public alias for corporate AR (D-051) — mirrors resolveCompanyIdForAp. */
export async function resolveCompanyIdForAr(
  projectId: string | null | undefined,
  ctx: ServiceContext,
): Promise<string> {
  return resolveCompanyId(projectId, ctx);
}

async function assertProjectGuardIfPresent(
  projectId: string | null | undefined,
  ctx: ServiceContext,
): Promise<void> {
  if (projectId) {
    await assertProjectAllowsOperationalMutation(projectId, ctx);
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createSalesInvoice(
  input: CreateSalesInvoiceInput,
  ctx: ServiceContext,
): Promise<SalesInvoiceWithLines> {
  input = parseArInput(createSalesInvoiceSchema, input);
  assertArDateRange(input.issueDate, input.dueDate);
  const inputFx = computeDocumentFxAmounts(input.currency, new Prisma.Decimal(0), input.fxRate ? new Prisma.Decimal(input.fxRate) : undefined);
  await assertArTenantModule(ctx);
  if (!canEditArArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear facturas");
  }
  assertManualInvoiceHasNoCertificationLinks(input);

  if (!input.projectId) {
    throw new ServiceError(
      "VALIDATION",
      "Para facturas corporativas usá el flujo Registrar transacción (Ingreso / factura).",
    );
  }
  await assertProjectGuardIfPresent(input.projectId, ctx);

  await assertContactRoleInTenant(input.clientContactId, "CLIENT", ctx.tenantId);

  const companyId = await resolveCompanyId(input.projectId, ctx);

  const suggestedLetter =
    input.invoiceLetter ??
    (await resolveSuggestedArInvoiceLetter({
      companyId,
      clientContactId: input.clientContactId,
      tenantId: ctx.tenantId,
    }));
  const forceZeroTax = suggestedLetter === "C" || suggestedLetter === "E";
  const pricesIncludeTax = forceZeroTax ? false : Boolean(input.pricesIncludeTax);

  const inv = await prisma.$transaction(
    async (tx) => {
      if (input.projectId) {
        const project = await lockProjectForOperationalMutation(tx, input.projectId, ctx);
        if (project.companyId !== null && project.companyId !== companyId) throw new ServiceError("CONFLICT", "La empresa de la obra cambió. Recargá e intentá de nuevo.");
      }
      await lockInvoiceNumberCompany(tx, companyId, ctx.tenantId);
      await assertContactRoleInTenant(input.clientContactId, "CLIENT", ctx.tenantId, { tx });
      await assertArTransactionModules(tx, ctx);
      const maxNum = await tx.salesInvoice.aggregate({
        where: { tenantId: ctx.tenantId, companyId, documentKind: "INVOICE" },
        _max: { number: true },
      });
      const number = (maxNum._max.number ?? 0) + 1;
      const created = await tx.salesInvoice.create({
        data: {
          tenantId: ctx.tenantId,
          companyId,
          projectId: input.projectId,
          clientContactId: input.clientContactId,
          certificationId: null,
          number,
          issueDate: new Date(input.issueDate),
          dueDate: new Date(input.dueDate),
          currency: input.currency ?? "ARS",
          fxRate: inputFx.fxRate,
          invoiceLetter: suggestedLetter,
          iibbPerceptionRate: new Prisma.Decimal(
            input.iibbPerceptionRate ?? DEFAULT_IIBB_PERCEPTION_RATE_PCT,
          ),
          notes: input.notes ?? null,
          internalNotes: input.internalNotes ?? null,
          externalInvoiceRef: input.externalInvoiceRef ?? null,
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
      });

      for (const line of input.lines) {
        const qty = new Prisma.Decimal(line.quantity);
        const price = new Prisma.Decimal(line.unitPrice);
        const rate = new Prisma.Decimal(forceZeroTax ? "0" : (line.taxRate ?? "0"));
        const { unitPriceNet, lineSubtotal, lineTax, lineTotal } = resolveInvoiceLineMoney({
          quantity: qty,
          unitPrice: price,
          taxRate: rate,
          discountPct: parseDiscountPct(line.discountPct),
          pricesIncludeTax,
        });
        await tx.salesInvoiceLine.create({
          data: {
            invoiceId: created.id,
            description: line.description,
            quantity: qty,
            unitPrice: unitPriceNet,
            taxRate: rate,
            discountPct: parseDiscountPct(line.discountPct),
            lineSubtotal,
            lineTax,
            lineTotal,
            certificationLineId: null,
            sortOrder: line.sortOrder ?? 0,
          },
        });
      }

      await recalcInvoiceTotals(tx as never, created.id);
      const inv = await tx.salesInvoice.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          ...arInvoiceParents,
          lines: { orderBy: { sortOrder: "asc" } },
          clientContact: { select: { id: true, tenantId: true, legalName: true, fantasyName: true } },
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
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  assertArInvoiceParents(inv, ctx);
  return serializeInvoice(inv);
}

export async function createInvoiceFromCertification(
  input: CreateInvoiceFromCertificationInput,
  ctx: ServiceContext,
  projectScopeId?: string,
): Promise<SalesInvoiceWithLines> {
  await assertArTenantModule(ctx);
  if (!canEditArArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear facturas");
  }

  const parsed = createInvoiceFromCertificationSchema.safeParse(input);
  if (!parsed.success)
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Datos inválidos");
  input = parsed.data;
  assertArDateRange(input.issueDate, input.dueDate);
  const cert = await requireCertificationAccess(input.certificationId, ctx);
  if (projectScopeId !== undefined && cert.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La certificación no pertenece a este proyecto");
  }
  await assertProjectAllowsOperationalMutation(cert.projectId, ctx);
  // Billing gate aligned with UI / STATE_MACHINES: APPROVED only.
  if (cert.status !== "APPROVED") {
    throw new ServiceError("CONFLICT", "Solo se pueden facturar certificaciones aprobadas");
  }
  if (cert.lines.length === 0) {
    throw new ServiceError("CONFLICT", "La certificación no tiene líneas para facturar");
  }

  const companyId =
    cert.companyId ??
    cert.budget.companyId ??
    cert.project.companyId ??
    (await resolveCompanyId(cert.projectId, ctx));
  if (isCrossCompany(companyId, ctx))
    throw new ServiceError("FORBIDDEN", "La certificación no pertenece a la empresa activa");
  await assertContactRoleInTenant(cert.project.clientContactId, "CLIENT", ctx.tenantId);

  const suggestedLetter =
    input.invoiceLetter ??
    (await resolveSuggestedArInvoiceLetter({
      companyId,
      clientContactId: cert.project.clientContactId,
      tenantId: ctx.tenantId,
    }));
  // PU de certificación ya incluye impuestos del presupuesto (SALE_PRICE_FORMULAS).
  // Default IVA factura = 0 para no duplicar; el usuario puede discriminar otro % si corresponde.
  // Letter C/E always force 0 ([D-084]).
  const forceZeroTax = suggestedLetter === "C" || suggestedLetter === "E";
  const taxRate = new Prisma.Decimal(forceZeroTax ? "0" : (input.taxRate ?? "0"));
  // D-008: preserve contractual currency; foreign amounts require an explicit manual rate.
  const fx = computeDocumentFxAmounts(
    cert.budget.currency,
    cert.totalAmount,
    input.fxRate ? new Prisma.Decimal(input.fxRate) : undefined,
  );

  let inv;
  try {
    inv = await prisma.$transaction(
      async (tx) => {
        await lockProjectForOperationalMutation(tx, cert.projectId, ctx);
        await lockInvoiceNumberCompany(tx, companyId, ctx.tenantId);
        await _lockCertificationProject(tx, cert.projectId);
        await assertArTransactionModules(tx, ctx);
        const currentCert = await loadCertificationRecord(cert.id, ctx, tx);
        if (
          currentCert.updatedAt.getTime() !== cert.updatedAt.getTime() ||
          currentCert.companyId !== cert.companyId ||
          currentCert.budget.companyId !== cert.budget.companyId ||
          currentCert.project.companyId !== cert.project.companyId ||
          currentCert.budget.currency !== cert.budget.currency ||
          currentCert.project.clientContactId !== cert.project.clientContactId ||
          currentCert.lines.length !== cert.lines.length ||
          currentCert.lines.some((line, i) => {
            const before = cert.lines[i];
            return (
              !before ||
              line.id !== before.id ||
              !line.currentQty.equals(before.currentQty) ||
              !line.unitSalePriceSnapshot.equals(before.unitSalePriceSnapshot) ||
              !line.periodAmount.equals(before.periodAmount)
            );
          })
        )
          throw new ServiceError(
            "CONFLICT",
            "La certificación cambió durante la facturación. Recargá y revisá sus valores.",
          );
        await assertContactRoleInTenant(
          currentCert.project.clientContactId,
          "CLIENT",
          ctx.tenantId,
          { tx },
        );
        if (currentCert.status !== "APPROVED") {
          throw new ServiceError("CONFLICT", "Solo se pueden facturar certificaciones aprobadas");
        }
        const existing = await tx.salesInvoice.findFirst({
          where: {
            certificationId: input.certificationId,
            tenantId: ctx.tenantId,
            status: { not: "CANCELLED" },
            documentKind: "INVOICE",
          },
          select: { id: true },
        });
        if (existing) {
          throw new ServiceError("CONFLICT", "Esta certificación ya tiene una factura activa");
        }

        const maxNum = await tx.salesInvoice.aggregate({
          where: { tenantId: ctx.tenantId, companyId, documentKind: "INVOICE" },
          _max: { number: true },
        });
        const number = (maxNum._max.number ?? 0) + 1;

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
            currency: cert.budget.currency,
            fxRate: fx.fxRate,
            invoiceLetter: suggestedLetter,
            iibbPerceptionRate: new Prisma.Decimal(input.iibbPerceptionRate ?? "0"),
            notes: input.notes ?? null,
            internalNotes: input.internalNotes ?? null,
            createdBy: ctx.actorUserId,
            updatedBy: ctx.actorUserId,
          },
        });

        await tx.salesInvoiceLine.createMany({
          data: cert.lines.map((line, sortOrder) => {
            const qty = line.currentQty;
            const price = line.unitSalePriceSnapshot;
            const { unitPriceNet, lineSubtotal, lineTax, lineTotal } = resolveInvoiceLineMoney({
              quantity: qty,
              unitPrice: price,
              taxRate,
              pricesIncludeTax: !forceZeroTax && Boolean(input.pricesIncludeTax),
            });
            return {
              invoiceId: created.id,
              description: `${line.wbsNode.code} - ${line.wbsNode.name}`,
              quantity: qty,
              unitPrice: unitPriceNet,
              taxRate,
              lineSubtotal,
              lineTax,
              lineTotal,
              certificationLineId: line.id,
              sortOrder,
            };
          }),
        });

        await recalcInvoiceTotals(tx as never, created.id);
        const createdInv = await tx.salesInvoice.findUniqueOrThrow({
          where: { id: created.id },
          include: {
            ...arInvoiceParents,
            lines: { orderBy: { sortOrder: "asc" } },
            clientContact: { select: { id: true, tenantId: true, legalName: true, fantasyName: true } },
          },
        });

        await auditAr(
          ctx,
          "sales_invoice.created_from_certification",
          "SalesInvoice",
          createdInv.id,
          { projectId: createdInv.projectId, companyId: createdInv.companyId },
          { after: { number: createdInv.number, certificationId: input.certificationId }, tx },
        );

        return createdInv;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ServiceError("CONFLICT", "Esta certificación ya tiene una factura activa");
    }
    throw err;
  }

  assertArInvoiceParents(inv, ctx);
  return serializeInvoice(inv);
}

export async function updateSalesInvoice(
  id: string,
  input: UpdateSalesInvoiceInput,
  ctx: ServiceContext,
  /** null = corporate; string = that project; omitted = entity scope with normal access checks. */
  projectScopeId?: string | null,
): Promise<SalesInvoiceWithLines> {
  await assertArTenantModule(ctx);
  input = parseArInput(updateSalesInvoiceSchema, input);
  const inv = await prisma.salesInvoice.findUnique({ where: { id }, include: arInvoiceParents });
  if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (inv.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(inv.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a la empresa activa");
  }
  if (projectScopeId !== undefined && inv.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a este proyecto");
  }
  if (!canMutateArForScope(ctx.roles, inv.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar facturas");
  }
  await assertProjectGuardIfPresent(inv.projectId, ctx);
  assertArInvoiceParents(inv, ctx);
  assertInvoiceEditable(inv);
  if (inv.documentKind === "INVOICE") assertArDateRange(input.issueDate ?? inv.issueDate, input.dueDate ?? inv.dueDate);

  const resultingLetter = input.invoiceLetter === undefined ? inv.invoiceLetter : input.invoiceLetter;
  const zeroTaxForLetter = resultingLetter === "C" || resultingLetter === "E";
  const isFiscalNote = inv.documentKind === "CREDIT_NOTE" || inv.documentKind === "DEBIT_NOTE";
  const isCreditNote = inv.documentKind === "CREDIT_NOTE";
  if (input.lines && !isFiscalNote) {
    throw new ServiceError(
      "VALIDATION",
      "Las líneas de una factura de venta no se editan desde este formulario.",
    );
  }
  if (input.lines && isFiscalNote && input.lines.length === 0) {
    throw new ServiceError("VALIDATION", "La nota debe tener al menos una línea");
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (inv.projectId) await lockProjectForOperationalMutation(tx, inv.projectId, ctx);
    await lockSalesInvoiceRow(tx, id, ctx.tenantId);
    const current = await tx.salesInvoice.findUniqueOrThrow({ where: { id }, include: arInvoiceParents });
    assertArInvoiceParents(current, ctx);
    assertInvoiceEditable(current);
    await assertArTransactionModules(tx, ctx);
    if (current.documentKind === "INVOICE") assertArDateRange(input.issueDate ?? current.issueDate, input.dueDate ?? current.dueDate);
    const updatedInvoice = await tx.salesInvoice.update({
      where: { id },
      data: {
        issueDate: input.issueDate ? new Date(input.issueDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        ...(input.fxRate !== undefined ? { fxRate: computeDocumentFxAmounts(current.currency, current.totalAmount, new Prisma.Decimal(input.fxRate)).fxRate } : {}),
        ...(input.invoiceLetter !== undefined ? { invoiceLetter: input.invoiceLetter } : {}),
        // NC credit amount is gross; never inherit/persist parent IIBB on draft edits.
        ...(isCreditNote
          ? { iibbPerceptionRate: new Prisma.Decimal(0) }
          : input.iibbPerceptionRate !== undefined
            ? { iibbPerceptionRate: new Prisma.Decimal(input.iibbPerceptionRate) }
            : {}),
        notes: input.notes,
        internalNotes: input.internalNotes,
        updatedBy: ctx.actorUserId,
      },
      include: {
        ...arInvoiceParents,
        lines: { orderBy: { sortOrder: "asc" } },
        clientContact: { select: { id: true, tenantId: true, legalName: true, fantasyName: true } },
      },
    });

    if (input.lines && isFiscalNote) {
      const previousById = indexStoredDocumentLines(input.lines, updatedInvoice.lines);
      await tx.salesInvoiceLine.deleteMany({ where: { invoiceId: id } });
      for (const [i, line] of input.lines.entries()) {
        const taxRate = zeroTaxForLetter
          ? new Prisma.Decimal(0)
          : new Prisma.Decimal(line.taxRate ?? "0");
        const { unitPriceNet, lineSubtotal, lineTax, lineTotal } = resolveInvoiceLineMoney({
          quantity: new Prisma.Decimal(line.quantity),
          unitPrice: new Prisma.Decimal(line.unitPrice),
          taxRate,
          discountPct: new Prisma.Decimal(line.discountPct ?? "0"),
          previous: line.id ? previousById.get(line.id) : undefined,
          pricesIncludeTax: zeroTaxForLetter ? false : input.pricesIncludeTax,
        });
        await tx.salesInvoiceLine.create({
          data: {
            invoiceId: id,
            description: line.description,
            quantity: new Prisma.Decimal(line.quantity),
            unitPrice: unitPriceNet,
            taxRate,
            discountPct: new Prisma.Decimal(line.discountPct ?? "0"),
            lineSubtotal,
            lineTax,
            lineTotal,
            sortOrder: line.sortOrder ?? i,
            certificationLineId: null,
          },
        });
      }
      await recalcInvoiceTotals(tx as never, id);
    } else if (zeroTaxForLetter && updatedInvoice.lines.some((l) => !l.taxRate.equals(0))) {
      for (const line of updatedInvoice.lines) {
        const { lineSubtotal, lineTax, lineTotal } = calcLine(
          line.quantity,
          line.unitPrice,
          new Prisma.Decimal(0),
          line.discountPct,
        );
        await tx.salesInvoiceLine.update({
          where: { id: line.id },
          data: { taxRate: new Prisma.Decimal(0), lineSubtotal, lineTax, lineTotal },
        });
      }
      await recalcInvoiceTotals(tx as never, id);
    } else if (isCreditNote || input.iibbPerceptionRate !== undefined) {
      await recalcInvoiceTotals(tx as never, id);
    }

    if (isCreditNote) {
      if (!inv.referencedSalesInvoiceId) {
        throw new ServiceError("VALIDATION", "La NC requiere factura de referencia.");
      }
      const refreshed = await tx.salesInvoice.findUniqueOrThrow({ where: { id } });
      const parent = await tx.salesInvoice.findUnique({
        where: { id: inv.referencedSalesInvoiceId },
        include: { receivable: true },
      });
      if (!parent || parent.tenantId !== ctx.tenantId) {
        throw new ServiceError("NOT_FOUND", "Factura de referencia no encontrada");
      }
      if (!parent.receivable || parent.receivable.status === "CANCELLED") {
        throw new ServiceError("CONFLICT", "La factura no tiene cuenta por cobrar activa.");
      }
      const balanceDue = normalizeObligationBalanceDue(
        computeObligationBalanceDue(
          parent.receivable.originalAmount,
          parent.receivable.paidAmount,
          parent.receivable.creditedAmount,
        ),
      );
      if (refreshed.totalAmount.greaterThan(balanceDue)) {
        throw new ServiceError(
          "CONFLICT",
          `La NC (${serializeMoneyDecimal(refreshed.totalAmount)}) supera el saldo pendiente (${serializeMoneyDecimal(balanceDue)}).`,
        );
      }
    }

    await auditAr(
      ctx,
      "sales_invoice.updated",
      "SalesInvoice",
      id,
      { projectId: updatedInvoice.projectId, companyId: updatedInvoice.companyId },
      {
        after: {
          number: updatedInvoice.number,
          documentKind: updatedInvoice.documentKind,
          ...(input.issueDate !== undefined ? { issueDate: input.issueDate } : {}),
          ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          ...(input.invoiceLetter !== undefined ? { invoiceLetter: input.invoiceLetter } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
          ...(input.lines ? { linesUpdated: true } : {}),
          ...(zeroTaxForLetter ? { taxRatesZeroedForLetter: input.invoiceLetter } : {}),
        },
        tx,
      },
    );

    return tx.salesInvoice.findUniqueOrThrow({
      where: { id },
      include: {
        ...arInvoiceParents,
        lines: { orderBy: { sortOrder: "asc" } },
        clientContact: { select: { id: true, tenantId: true, legalName: true, fantasyName: true } },
      },
    });
  }, { timeout: 30_000, maxWait: 10_000 });

  return serializeInvoice(updated);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function issueSalesInvoice(
  id: string,
  ctx: ServiceContext,
  /** null = corporate; string = that project; omitted = entity scope with normal access checks. */
  projectScopeId?: string | null,
): Promise<SalesInvoiceWithLines> {
  await assertArTenantModule(ctx);

  const invPreview = await prisma.salesInvoice.findUnique({
    where: { id },
    select: { tenantId: true, projectId: true, companyId: true },
  });
  if (!invPreview) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (invPreview.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (projectScopeId !== undefined && invPreview.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a este proyecto");
  }
  if (isCrossCompany(invPreview.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a la empresa activa");
  }
  if (!canMutateArForScope(ctx.roles, invPreview.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para emitir facturas");
  }
  await assertProjectGuardIfPresent(invPreview.projectId, ctx);

  const result = await prisma.$transaction(
    async (tx) => {
      if (invPreview.projectId)
        await lockProjectForOperationalMutation(tx, invPreview.projectId, ctx);
      await lockSalesInvoiceRow(tx, id, ctx.tenantId);
      const inv = await tx.salesInvoice.findUnique({
        where: { id },
        include: {
          ...arInvoiceParents,
          lines: true,
          clientContact: { select: { id: true, tenantId: true, legalName: true, fantasyName: true, country: true } },
          company: { select: { id: true, tenantId: true, country: true } },
        },
      });
      if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
      if (inv.tenantId !== ctx.tenantId)
        throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
      assertArInvoiceParents(inv, ctx);
      await assertArTransactionModules(tx, ctx);
      assertInvoiceEditable(inv);

      if (inv.documentKind !== "INVOICE") {
        throw new ServiceError(
          "VALIDATION",
          inv.documentKind === "CREDIT_NOTE"
            ? "Usá emitir nota de crédito para este comprobante."
            : "Usá emitir nota de débito para este comprobante.",
        );
      }

      if (inv.lines.length === 0) {
        throw new ServiceError("CONFLICT", "No se puede emitir una factura sin líneas");
      }

      assertInvoiceLetterOnIssue({
        invoiceLetter: inv.invoiceLetter,
        companyCountry: inv.company.country,
        counterpartyCountry: inv.clientContact.country,
        documentLabel: "factura de venta",
      });
      // D-133 requires explicit draft correction; recalculation must not erase a stored negative component.
      assertNonnegativeInvoiceTaxes(inv);
      await recalcInvoiceTotals(tx as never, id);
      const refreshed = await tx.salesInvoice.findUniqueOrThrow({ where: { id } });
      assertNonnegativeInvoiceTaxes({ ...refreshed, lines: inv.lines });
      if (refreshed.totalAmount.lessThanOrEqualTo(0)) {
        throw new ServiceError("CONFLICT", "El total de la factura debe ser mayor a 0");
      }
      assertInvoiceLetterTaxConsistencyOnIssue({
        invoiceLetter: inv.invoiceLetter,
        taxAmount: refreshed.taxAmount,
      });

      const fx = computeDocumentFxAmounts(
        refreshed.currency,
        refreshed.totalAmount,
        refreshed.fxRate,
      );

      // Conditional flip prevents issue↔cancel races leaving orphan receivables.
      const flipped = await tx.salesInvoice.updateMany({
        where: { id, tenantId: ctx.tenantId, status: "DRAFT" },
        data: {
          status: "ISSUED",
          fxRate: fx.fxRate,
          amountArs: fx.amountArs,
          updatedBy: ctx.actorUserId,
        },
      });
      assertOptimisticRowUpdate(
        flipped.count,
        "La factura ya no está en borrador. Recargá e intentá de nuevo.",
      );

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
          originalAmount: refreshed.totalAmount,
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
      });

      const issued = await tx.salesInvoice.findUniqueOrThrow({
        where: { id },
        include: {
          ...arInvoiceParents,
          lines: { orderBy: { sortOrder: "asc" } },
          clientContact: { select: { id: true, tenantId: true, legalName: true, fantasyName: true } },
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
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  await ensureDraftJournalFromSalesInvoice(result.id, ctx);

  if (result.projectId) {
    try {
      const receivable = await prisma.receivable.findFirst({
        where: {
          salesInvoiceId: result.id, tenantId: result.tenantId, companyId: result.companyId, projectId: result.projectId,
          status: { notIn: ["PAID", "CANCELLED"] },
        },
        select: { id: true, originalAmount: true, paidAmount: true, creditedAmount: true },
      });
      if (receivable) {
        const balance = normalizeObligationBalanceDue(
          computeObligationBalanceDue(receivable.originalAmount, receivable.paidAmount, receivable.creditedAmount),
        );
        if (balance.greaterThan(0)) {
          await notifyReceivableReadyToCollect({
            ctx,
            salesInvoiceId: result.id,
            receivableId: receivable.id,
            projectId: result.projectId,
            companyId: result.companyId,
            invoiceNumber: result.number,
            amountLabel: `${serializeMoneyDecimal(balance)} ${result.currency}`,
          });
        }
      }
    } catch {
      console.warn("[AR] Issued invoice notification failed", { invoiceId: result.id });
    }
  }

  return serializeInvoice(result);
}

export async function cancelSalesInvoice(
  id: string,
  ctx: ServiceContext,
  /** null = corporate; string = that project; omitted = entity scope with normal access checks. */
  projectScopeId?: string | null,
  reason?: string,
): Promise<SalesInvoice> {
  await assertArTenantModule(ctx);

  const invPreview = await prisma.salesInvoice.findUnique({
    where: { id },
    include: arInvoiceParents,
  });
  if (!invPreview) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
  if (invPreview.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (projectScopeId !== undefined && invPreview.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a este proyecto");
  }
  if (isCrossCompany(invPreview.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La factura no pertenece a la empresa activa");
  }
  if (!canMutateArForScope(ctx.roles, invPreview.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para anular facturas");
  }

  assertArInvoiceParents(invPreview, ctx);
  await requireProjectAccessIfPresent(invPreview.projectId, ctx);
  const glParams = {
    companyId: invPreview.companyId,
    sourceType: invPreview.documentKind === "DEBIT_NOTE" ? "SALES_DEBIT_NOTE" as const : "SALES_INVOICE" as const,
    sourceId: id,
    sourceLabel: "la factura de venta",
  };

  if (invPreview.status === "CANCELLED") {
    // Repair orphan DRAFT left if a prior cancel succeeded but GL cleanup failed.
    await cancelDraftJournalOnOperationalCancel(ctx, glParams);
    return prisma.salesInvoice.findUniqueOrThrow({ where: { id } });
  }

  if (invPreview.status === "ISSUED") {
    await assertJournalAllowsOperationalCancel(ctx, glParams);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (invPreview.projectId) await lockProjectForMutation(tx, invPreview.projectId, ctx.tenantId);
    await lockInvoiceNumberCompany(tx, invPreview.companyId, ctx.tenantId, false);
    await assertArTransactionModules(tx, ctx);
    await lockSalesInvoiceRow(tx, id, ctx.tenantId);
    const inv = await tx.salesInvoice.findUnique({ where: { id }, include: arInvoiceParents });
    if (!inv) throw new ServiceError("NOT_FOUND", "Factura no encontrada");
    if (inv.tenantId !== ctx.tenantId)
      throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    assertArInvoiceParents(inv, ctx);
    if (inv.status === "CANCELLED") return inv;
    const cancellationReason = arCancellationReason(inv.status, reason);

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
            select: {
              id: true,
              paidAmount: true,
              creditedAmount: true,
              projectId: true,
              companyId: true,
            },
          })
        : null;
    const activeNoteCount =
      inv.status === "ISSUED" && inv.documentKind === "INVOICE"
        ? await tx.salesInvoice.count({
            where: {
              tenantId: ctx.tenantId,
              referencedSalesInvoiceId: id,
              documentKind: { in: ["CREDIT_NOTE", "DEBIT_NOTE"] },
              status: "ISSUED",
            },
          })
        : 0;
    assertCanCancelSalesInvoice({
      status: inv.status,
      documentKind: inv.documentKind,
      hasReceivable: receivable != null,
      activeCollectionCount,
      receivablePaidAmount: receivable?.paidAmount ?? null,
      receivableCreditedAmount: receivable?.creditedAmount ?? null,
      activeCreditDebitNoteCount: activeNoteCount,
    });

    // BR-AR-004: cascade cancel linked Receivable (optimistic lock on paidAmount)
    const receivableCancel = await tx.receivable.updateMany({
      where: {
        salesInvoiceId: id,
        status: { not: "CANCELLED" },
        ...(inv.status === "ISSUED" && receivable
          ? { paidAmount: receivable.paidAmount, creditedAmount: receivable.creditedAmount }
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

    const flipped = await tx.salesInvoice.updateMany({
      where: { id, tenantId: ctx.tenantId, status: inv.status },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La factura cambió de estado mientras la anulabas. Recargá e intentá de nuevo.",
    );

    const updated = await tx.salesInvoice.findUniqueOrThrow({ where: { id } });

    await auditAr(
      ctx,
      "sales_invoice.cancelled",
      "SalesInvoice",
      id,
      { projectId: updated.projectId, companyId: updated.companyId },
      { after: { number: inv.number, status: "CANCELLED", cancellationReason }, tx },
    );

    await cancelDraftJournalOnOperationalCancel(ctx, glParams, tx);
    return updated;
  }, { timeout: 30_000, maxWait: 10_000 });

  await cancelDraftJournalOnOperationalCancel(ctx, glParams);

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

type RawInvoiceListRow = SalesInvoice & {
  clientContact: { legalName: string; fantasyName: string | null };
};

function serializeInvoiceListRow(inv: RawInvoiceListRow): ProjectSalesInvoiceListRow {
  const codePrefix =
    inv.documentKind === "CREDIT_NOTE" ? "NC" : inv.documentKind === "DEBIT_NOTE" ? "ND" : "FAC";
  return {
    ...stripArParents(inv),
    fxRate: inv.fxRate.toFixed(6),
    amountArs: serializeMoneyDecimal(inv.amountArs),
    code: `${codePrefix}-${String(inv.number).padStart(5, "0")}`,
    clientName: inv.clientContact.fantasyName ?? inv.clientContact.legalName,
    subtotal: serializeMoneyDecimal(inv.subtotal),
    taxAmount: serializeMoneyDecimal(inv.taxAmount),
    iibbPerceptionRate: serializeRatePctDecimal(inv.iibbPerceptionRate),
    iibbPerceptionAmount: serializeMoneyDecimal(inv.iibbPerceptionAmount),
    totalAmount: serializeMoneyDecimal(inv.totalAmount),
    ...classFieldsForSalesInvoice({
      projectId: inv.projectId,
      certificationId: inv.certificationId,
    }),
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
    discountPct: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal;
    lineTax: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    certificationLineId: string | null;
    sortOrder: number;
  }>;
  clientContact: { legalName: string; fantasyName: string | null };
};

function serializeInvoice(inv: RawInvoice): SalesInvoiceWithLines {
  const codePrefix =
    inv.documentKind === "CREDIT_NOTE" ? "NC" : inv.documentKind === "DEBIT_NOTE" ? "ND" : "FAC";
  return {
    ...stripArParents(inv),
    fxRate: inv.fxRate.toFixed(6),
    amountArs: serializeMoneyDecimal(inv.amountArs),
    code: `${codePrefix}-${String(inv.number).padStart(5, "0")}`,
    clientName: inv.clientContact.fantasyName ?? inv.clientContact.legalName,
    subtotal: serializeMoneyDecimal(inv.subtotal),
    taxAmount: serializeMoneyDecimal(inv.taxAmount),
    iibbPerceptionRate: serializeRatePctDecimal(inv.iibbPerceptionRate),
    iibbPerceptionAmount: serializeMoneyDecimal(inv.iibbPerceptionAmount),
    totalAmount: serializeMoneyDecimal(inv.totalAmount),
    lines: inv.lines.map((l) => ({
      id: l.id,
      invoiceId: l.invoiceId,
      description: l.description,
      quantity: serializeQtyDecimal(l.quantity),
      unitPrice: serializeUnitPriceDecimal(l.unitPrice),
      taxRate: serializeRatePctDecimal(l.taxRate),
      discountPct: serializeRatePctDecimal(l.discountPct),
      lineSubtotal: serializeMoneyDecimal(l.lineSubtotal),
      lineTax: serializeMoneyDecimal(l.lineTax),
      lineTotal: serializeMoneyDecimal(l.lineTotal),
      certificationLineId: l.certificationLineId,
      sortOrder: l.sortOrder,
    })),
    ...classFieldsForSalesInvoice({
      projectId: inv.projectId,
      certificationId: inv.certificationId,
    }),
  };
}
