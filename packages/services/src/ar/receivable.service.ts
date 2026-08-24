import { Prisma, prisma, Receivable, ReceivableStatus } from "@bloqer/database";
import {
  canEditCompanyAr,
  canMutateArForScope,
  canViewArProjectArea,
  canViewCompanyAr,
} from "./ar-access";
import {
  appendPendingReceivablesFilter,
  appendReceivableStatusFilter,
} from "../finance/receivable-list-filters";
import { openReceivableBalanceWhere } from "../finance/obligation-balance-filter";
import { auditAr } from "./ar-audit";
import { assertArTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { isCrossCompany } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";
import { ACTIVE_OBLIGATION_STATUSES } from "../finance/obligation-status";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { resolvePagination } from "../finance/pagination";
import { assertCanCancelReceivableDirect } from "./receivable-cancel-guards";
import { deriveObligationDisplayStatus, hasOpenObligationBalance, isObligationOverdue, OBLIGATION_OPEN_BALANCE_EPSILON } from "../finance/obligation-date";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { requireProjectInTenant } from "../project/require-project-in-tenant";
import {
  computeObligationBalanceDue,
  normalizeObligationBalanceDue,
} from "../finance/obligation-balance";
import {
  formatSalesInvoiceCode,
  RECEIVABLES_FIELD_FETCH_LIMIT,
  utcIsoDate,
  type ReceivablesFieldRow,
} from "./receivables-field";

const MAX_COLLECTIBLE_RECEIVABLES = 500;

// ─── View type ────────────────────────────────────────────────────────────────

export type ReceivableView = Omit<Receivable, "originalAmount" | "paidAmount"> & {
  originalAmount: string;
  paidAmount: string;
  balanceDue: string;
  clientName: string;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getReceivableById(
  id: string,
  ctx: ServiceContext,
  /** When set (project workspace routes), corporate receivables and cross-project IDs are rejected. */
  projectScopeId?: string,
): Promise<ReceivableView> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por cobrar");
  }
  const r = await prisma.receivable.findUnique({
    where: { id },
    include: { clientContact: { select: { legalName: true, fantasyName: true } } },
  });
  if (!r) throw new ServiceError("NOT_FOUND", "Cuenta por cobrar no encontrada");
  if (r.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (projectScopeId !== undefined && r.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La cuenta por cobrar no pertenece a este proyecto");
  }
  const reconciled = await reconcileReceivableStatusIfSettled(r, ctx);
  return serializeReceivable({ ...r, ...reconciled });
}

export async function getReceivableBySalesInvoiceId(
  salesInvoiceId: string,
  ctx: ServiceContext,
  projectScopeId?: string,
): Promise<ReceivableView | null> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por cobrar");
  }
  const r = await prisma.receivable.findUnique({
    where: { salesInvoiceId },
    include: { clientContact: { select: { legalName: true, fantasyName: true } } },
  });
  if (!r) return null;
  if (r.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (projectScopeId !== undefined && r.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La cuenta por cobrar no pertenece a este proyecto");
  }
  const reconciled = await reconcileReceivableStatusIfSettled(r, ctx);
  return serializeReceivable({ ...r, ...reconciled });
}

export type ProjectReceivableListFilters = {
  page?: number;
  pageSize?: number;
};

export type ProjectReceivableListRow = ReceivableView & {
  salesInvoiceCode: string | null;
};

export async function listReceivablesByProject(
  projectId: string,
  ctx: ServiceContext,
  filters?: ProjectReceivableListFilters,
): Promise<{ data: ProjectReceivableListRow[]; total: number }> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por cobrar");
  }
  await requireProjectInTenant(projectId, ctx.tenantId);

  const { skip, take } = resolvePagination({
    page: filters?.page,
    pageSize: filters?.pageSize,
  });

  const where = { projectId, tenantId: ctx.tenantId };

  const [rows, total] = await Promise.all([
    prisma.receivable.findMany({
      where,
      include: {
        clientContact: { select: { legalName: true, fantasyName: true } },
        salesInvoice: { select: { number: true } },
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.receivable.count({ where }),
  ]);
  const reconciled = await Promise.all(rows.map((r) => reconcileReceivableStatusIfSettled(r, ctx)));
  return {
    data: reconciled.map((p, i) => {
      const row = rows[i]!;
      const base = serializeReceivable({ ...row, ...p });
      const num = row.salesInvoice?.number;
      return {
        ...base,
        salesInvoiceCode: num != null ? `FAC-${String(num).padStart(5, "0")}` : null,
      };
    }),
    total,
  };
}

/** Open/partial receivables for collection picker (capped, no pagination). */
export async function listCollectibleReceivablesByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<ReceivableView[]> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por cobrar");
  }
  await requireProjectInTenant(projectId, ctx.tenantId);

  const rows = await prisma.receivable.findMany({
    where: {
      projectId,
      tenantId: ctx.tenantId,
      status: { in: [...ACTIVE_OBLIGATION_STATUSES] },
      ...openReceivableBalanceWhere(),
    },
    include: { clientContact: { select: { legalName: true, fantasyName: true } } },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    take: MAX_COLLECTIBLE_RECEIVABLES,
  });

  return rows
    .map(serializeReceivable)
    .filter((r) => new Prisma.Decimal(r.balanceDue).greaterThan(0));
}

export type CompanyReceivableListFilters = {
  status?: "OPEN" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";
  pendingOnly?: boolean;
  clientContactId?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  search?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type CompanyReceivableListRow = ReceivableView & {
  projectCode: string;
  projectName: string;
  salesInvoiceCode: string | null;
};

/** Company-level AR label when projectId is null (D-051). */
export const COMPANY_AR_PROJECT_LABEL = "Empresa";

/** All receivables for the tenant company (project and corporate). VIEW AR only. */
export async function listCompanyReceivables(
  ctx: ServiceContext,
  filters?: CompanyReceivableListFilters,
): Promise<{ data: CompanyReceivableListRow[]; total: number }> {
  await assertArTenantModule(ctx);
  if (!canViewCompanyAr(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por cobrar a nivel empresa");
  }

  const { skip, take } = resolvePagination({
    page: filters?.page,
    pageSize: filters?.pageSize,
  });

  const search = filters?.search?.trim();
  const where: Prisma.ReceivableWhereInput = {
    tenantId: ctx.tenantId,
    // Receivable.companyId es NOT NULL → scope directo por empresa.
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    ...(filters?.clientContactId ? { clientContactId: filters.clientContactId } : {}),
    ...(filters?.dueDateFrom || filters?.dueDateTo
      ? {
          dueDate: {
            ...(filters.dueDateFrom ? { gte: new Date(filters.dueDateFrom) } : {}),
            ...(filters.dueDateTo ? { lte: new Date(filters.dueDateTo) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { clientContact: { legalName: { contains: search, mode: "insensitive" } } },
            { clientContact: { fantasyName: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  if (filters?.pendingOnly && !filters.status) {
    appendPendingReceivablesFilter(where);
  }
  appendReceivableStatusFilter(where, filters?.status);

  const dueDir = filters?.sortDir === "desc" ? "desc" : "asc";

  const [rows, total] = await Promise.all([
    prisma.receivable.findMany({
      where,
      include: {
        clientContact: { select: { legalName: true, fantasyName: true } },
        salesInvoice: { select: { number: true } },
        project: { select: { code: true, name: true } },
      },
      orderBy: [{ dueDate: dueDir }, { id: dueDir }],
      skip,
      take,
    }),
    prisma.receivable.count({ where }),
  ]);

  const reconciled = await Promise.all(rows.map((r) => reconcileReceivableStatusIfSettled(r, ctx)));
  const data: CompanyReceivableListRow[] = reconciled.map((p, i) => {
    const r = rows[i]!;
    const base = serializeReceivable({ ...r, ...p });
    const num = r.salesInvoice?.number;
    return {
      ...base,
      projectCode: r.project?.code ?? "—",
      projectName: r.project?.name ?? COMPANY_AR_PROJECT_LABEL,
      salesInvoiceCode: num != null ? `FAC-${String(num).padStart(5, "0")}` : null,
    };
  });

  return { data, total };
}

/**
 * Corporate receivable: `projectId === null`. VIEW AR only (D-051).
 */
export async function getCompanyReceivableById(
  id: string,
  ctx: ServiceContext,
): Promise<CompanyReceivableListRow> {
  await assertArTenantModule(ctx);
  if (!canViewCompanyAr(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por cobrar a nivel empresa");
  }
  const r = await prisma.receivable.findUnique({
    where: { id },
    include: {
      clientContact: { select: { legalName: true, fantasyName: true } },
      salesInvoice: { select: { number: true } },
    },
  });
  if (!r) throw new ServiceError("NOT_FOUND", "Cuenta por cobrar no encontrada");
  if (r.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (r.projectId !== null) {
    throw new ServiceError(
      "FORBIDDEN",
      "Esta cuenta está asignada a un proyecto; usá el espacio de trabajo del proyecto",
    );
  }
  if (isCrossCompany(r.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La cuenta no pertenece a la empresa activa");
  }
  const reconciled = await reconcileReceivableStatusIfSettled(r, ctx);
  const base = serializeReceivable({ ...r, ...reconciled });
  const num = r.salesInvoice?.number;
  return {
    ...base,
    projectCode: "—",
    projectName: COMPANY_AR_PROJECT_LABEL,
    salesInvoiceCode: num != null ? `FAC-${String(num).padStart(5, "0")}` : null,
  };
}

export type ReceivablesFieldBoardResult = {
  rows: ReceivablesFieldRow[];
  total: number;
  truncatedFetch: boolean;
};

/**
 * Lightweight Field list: receivables only (invoice number + optional project name).
 * Skips aging and related invoices/collections. Not a second collection engine.
 * Company scope matches `listCompanyReceivables` (project + corporate).
 */
export async function listReceivablesFieldBoard(
  ctx: ServiceContext,
  scope: { projectId: string } | { company: true },
): Promise<ReceivablesFieldBoardResult> {
  await assertArTenantModule(ctx);

  const where: Prisma.ReceivableWhereInput = { tenantId: ctx.tenantId };

  if ("projectId" in scope) {
    if (!canViewArProjectArea(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por cobrar");
    }
    await requireProjectInTenant(scope.projectId, ctx.tenantId);
    where.projectId = scope.projectId;
  } else {
    if (!canViewCompanyAr(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por cobrar a nivel empresa");
    }
    if (ctx.companyId) where.companyId = ctx.companyId;
  }

  const [rows, total] = await Promise.all([
    prisma.receivable.findMany({
      where,
      include: {
        clientContact: { select: { legalName: true, fantasyName: true } },
        salesInvoice: { select: { number: true } },
        project: { select: { name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: RECEIVABLES_FIELD_FETCH_LIMIT,
    }),
    prisma.receivable.count({ where }),
  ]);

  const reconciled = await Promise.all(rows.map((r) => reconcileReceivableStatusIfSettled(r, ctx)));
  const mapped: ReceivablesFieldRow[] = reconciled.map((p, i) => {
    const row = rows[i]!;
    const { salesInvoice, project, ...receivableWithContact } = row;
    const base = serializeReceivable({ ...receivableWithContact, ...p });
    return {
      id: base.id,
      clientName: base.clientName,
      salesInvoiceId: base.salesInvoiceId,
      salesInvoiceCode: formatSalesInvoiceCode(salesInvoice?.number),
      projectId: base.projectId,
      projectName: project?.name ?? null,
      issueDateIso: utcIsoDate(base.issueDate),
      dueDateIso: utcIsoDate(base.dueDate),
      currency: base.currency,
      originalAmount: base.originalAmount,
      paidAmount: base.paidAmount,
      balanceDue: base.balanceDue,
      status: base.status,
    };
  });

  return {
    rows: mapped,
    total,
    truncatedFetch: total > RECEIVABLES_FIELD_FETCH_LIMIT,
  };
}

/**
 * Guard for company Finanzas mutations (cobrar / cancelar) — D-051.
 * Ensures the receivable is corporate and belongs to the active company.
 */
export async function assertCompanyReceivableMutable(
  id: string,
  ctx: ServiceContext,
): Promise<void> {
  await assertArTenantModule(ctx);
  if (!canEditCompanyAr(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para modificar cuentas por cobrar");
  }
  const r = await prisma.receivable.findUnique({
    where: { id },
    select: { tenantId: true, projectId: true, companyId: true },
  });
  if (!r || r.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Cuenta por cobrar no encontrada");
  }
  if (r.projectId !== null) {
    throw new ServiceError(
      "FORBIDDEN",
      "Esta cuenta está asignada a un proyecto; usá el espacio de trabajo del proyecto",
    );
  }
  if (isCrossCompany(r.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La cuenta no pertenece a la empresa activa");
  }
}

export type ReceivablesProjectSummary = {
  totalByCurrency: { currency: string; amount: string }[];
  overdueByCurrency: { currency: string; amount: string }[];
};

/** Lightweight aggregation for project finance overview (no full list). */
export async function summarizeReceivablesByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<ReceivablesProjectSummary> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por cobrar");
  }
  await requireProjectInTenant(projectId, ctx.tenantId);

  const rows = await prisma.receivable.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    select: {
      currency: true,
      originalAmount: true,
      paidAmount: true,
      dueDate: true,
      status: true,
    },
  });

  const total = new Map<string, Prisma.Decimal>();
  const overdue = new Map<string, Prisma.Decimal>();
  const zero = new Prisma.Decimal(0);

  for (const r of rows) {
    if (r.status === "CANCELLED") continue;
    const bal = r.originalAmount.minus(r.paidAmount);
    if (!hasOpenObligationBalance(bal, OBLIGATION_OPEN_BALANCE_EPSILON)) continue;
    const cur = r.currency;
    total.set(cur, (total.get(cur) ?? zero).add(bal));
    if (isObligationOverdue(r.dueDate)) {
      overdue.set(cur, (overdue.get(cur) ?? zero).add(bal));
    }
  }

  const toRows = (m: Map<string, Prisma.Decimal>) =>
    [...m.entries()]
      .filter(([, v]) => hasOpenObligationBalance(v, OBLIGATION_OPEN_BALANCE_EPSILON))
      .map(([currency, amount]) => ({ currency, amount: serializeMoneyDecimal(amount) }))
      .sort((a, b) => a.currency.localeCompare(b.currency));

  return { totalByCurrency: toRows(total), overdueByCurrency: toRows(overdue) };
}

export async function cancelReceivable(
  id: string,
  ctx: ServiceContext,
  projectScopeId?: string,
): Promise<Receivable> {
  await assertArTenantModule(ctx);

  const preview = await prisma.receivable.findUnique({
    where: { id },
    select: { tenantId: true, projectId: true, companyId: true },
  });
  if (!preview) throw new ServiceError("NOT_FOUND", "Cuenta por cobrar no encontrada");
  if (preview.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (projectScopeId !== undefined && preview.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La cuenta por cobrar no pertenece a este proyecto");
  }
  if (isCrossCompany(preview.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La cuenta no pertenece a la empresa activa");
  }
  if (!canMutateArForScope(ctx.roles, preview.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar cuentas por cobrar");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.receivable.findUnique({ where: { id } });
    if (!r) throw new ServiceError("NOT_FOUND", "Cuenta por cobrar no encontrada");
    if (r.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (r.status === "CANCELLED") throw new ServiceError("CONFLICT", "La cuenta ya está cancelada");

    const salesInvoice = await tx.salesInvoice.findUnique({
      where: { id: r.salesInvoiceId },
      select: { status: true, number: true },
    });
    const activeCollections = await tx.collection.count({
      where: { receivableId: id, status: "CONFIRMED", tenantId: ctx.tenantId },
    });
    assertCanCancelReceivableDirect({
      salesInvoiceStatus: salesInvoice?.status,
      activeCollectionCount: activeCollections,
      paidAmount: r.paidAmount,
    });

    const receivableCancel = await tx.receivable.updateMany({
      where: { id, status: { not: "CANCELLED" }, paidAmount: r.paidAmount },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      receivableCancel.count,
      "El saldo cambió mientras cancelabas la cuenta. Revisá cobranzas e intentá de nuevo.",
    )
    const updated = await tx.receivable.findUniqueOrThrow({ where: { id } });

    await auditAr(
      ctx,
      "receivable.cancelled",
      "Receivable",
      id,
      { projectId: updated.projectId, companyId: updated.companyId },
      { after: { status: "CANCELLED", number: salesInvoice?.number ?? null }, tx },
    );

    return updated;
  });

  return updated;
}

type RawReceivable = Receivable & {
  clientContact: { legalName: string; fantasyName: string | null };
  salesInvoice?: { number: number } | null;
  project?: { code: string; name: string } | null;
};

async function reconcileReceivableStatusIfSettled(
  receivable: Receivable,
  ctx: ServiceContext,
): Promise<Receivable> {
  if (receivable.status === "PAID" || receivable.status === "CANCELLED") return receivable;
  const balanceDue = computeObligationBalanceDue(receivable.originalAmount, receivable.paidAmount);
  if (hasOpenObligationBalance(balanceDue)) return receivable;

  const updated = await prisma.receivable.updateMany({
    where: {
      id: receivable.id,
      tenantId: ctx.tenantId,
      status: { notIn: ["PAID", "CANCELLED"] },
      paidAmount: receivable.paidAmount,
      originalAmount: receivable.originalAmount,
    },
    data: {
      status: "PAID",
      paidAmount: receivable.originalAmount,
      updatedBy: ctx.actorUserId,
    },
  });
  if (updated.count === 0) return receivable;
  return { ...receivable, status: "PAID", paidAmount: receivable.originalAmount };
}

function serializeReceivable(r: RawReceivable): ReceivableView {
  const rawBalance = computeObligationBalanceDue(r.originalAmount, r.paidAmount);
  const balanceDue = normalizeObligationBalanceDue(rawBalance);
  const status = deriveObligationDisplayStatus(r.status, rawBalance, r.dueDate, undefined, r.paidAmount);
  return {
    ...r,
    status,
    originalAmount: serializeMoneyDecimal(r.originalAmount),
    paidAmount: serializeMoneyDecimal(r.paidAmount),
    balanceDue: serializeMoneyDecimal(balanceDue),
    clientName: r.clientContact.fantasyName ?? r.clientContact.legalName,
  };
}
