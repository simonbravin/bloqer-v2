import { Prisma, prisma, Collection } from "@bloqer/database";
import { canMutateArForScope, canViewArProjectArea, canViewCompanyAr } from "../ar/ar-access";
import type { CreateCollectionInput } from "@bloqer/validators";
import { auditAr } from "../ar/ar-audit";
import { ACTIVE_OBLIGATION_STATUSES } from "../finance/obligation-status";
import { resolveObligationStoredStatus } from "../finance/obligation-stored-status";
import { effectiveObligationPaidAfterPayment } from "../finance/obligation-balance";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { resolvePagination } from "../finance/pagination";
import { computeDocumentFxAmounts } from "../finance/fx-amount.service";
import { assertArTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { assertTreasuryAccountCurrencyMatches } from "./treasury-currency-guards";
import { serializeMoneyDecimal, toMoneyDecimal } from "../finance/money-decimal";
import { isCrossCompany } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { ensureDraftJournalFromCollection } from "../accounting/accounting-auto-draft.service";
import {
  assertJournalAllowsOperationalCancel,
  cancelDraftJournalOnOperationalCancel,
} from "../accounting/accounting-cancel-sync.service";
import { assertFinancialPeriodOpen } from "../finance/period-lock.service";
import {
  assertPeriodOpenUnderCompanyLock,
  lockTreasuryAccountRow,
} from "./treasury-write-locks";
import { assertResourceTenant } from "../security/tenant-isolation";
import {
  collectionReplayMatches,
  requireIdempotencyKey,
  withIdempotentCreate,
} from "../idempotency/idempotency";

export type CollectionView = Omit<Collection, "amount"> & {
  amount: string;
  accountName: string;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getCollectionById(
  id: string,
  ctx: ServiceContext,
  /** When set (project workspace routes), corporate collections and cross-project IDs are rejected. */
  projectScopeId?: string,
): Promise<CollectionView> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cobranzas");
  }
  const c = await prisma.collection.findUnique({
    where: { id },
    include: { account: { select: { name: true } } },
  });
  if (!c) throw new ServiceError("NOT_FOUND", "Cobranza no encontrada");
  if (c.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(c.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La cobranza no pertenece a la empresa activa");
  }
  if (projectScopeId !== undefined && c.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La cobranza no pertenece a este proyecto");
  }
  return serialize(c);
}

export type ProjectCollectionListFilters = {
  page?: number;
  pageSize?: number;
};

export async function listCollectionsByProject(
  projectId: string,
  ctx: ServiceContext,
  filters?: ProjectCollectionListFilters,
): Promise<{ data: CollectionView[]; total: number }> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cobranzas");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const { skip, take } = resolvePagination({
    page: filters?.page,
    pageSize: filters?.pageSize,
  });

  const where = { projectId, tenantId: ctx.tenantId };

  const [rows, total] = await Promise.all([
    prisma.collection.findMany({
      where,
      include: { account: { select: { name: true } } },
      orderBy: [{ collectionDate: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.collection.count({ where }),
  ]);
  return { data: rows.map(serialize), total };
}

export async function listCollectionsByReceivable(
  receivableId: string,
  ctx: ServiceContext,
  projectScopeId?: string,
): Promise<CollectionView[]> {
  await assertArTenantModule(ctx);

  const receivable = await prisma.receivable.findUnique({
    where: { id: receivableId },
    select: { tenantId: true, projectId: true },
  });
  if (!receivable) throw new ServiceError("NOT_FOUND", "Cuenta por cobrar no encontrada");
  assertResourceTenant(receivable.tenantId, ctx.tenantId);

  if (projectScopeId !== undefined) {
    if (!canViewArProjectArea(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver cobranzas");
    }
    if (receivable.projectId !== projectScopeId) {
      throw new ServiceError("FORBIDDEN", "La cuenta por cobrar no pertenece a este proyecto");
    }
  } else if (receivable.projectId === null) {
    if (!canViewCompanyAr(ctx.roles)) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver cobranzas a nivel empresa");
    }
  } else if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cobranzas");
  }

  const rows = await prisma.collection.findMany({
    where: { receivableId, tenantId: ctx.tenantId },
    include: { account: { select: { name: true } } },
    orderBy: { collectionDate: "desc" },
  });
  return rows.map(serialize);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createCollection(
  input: CreateCollectionInput,
  ctx: ServiceContext,
  projectScopeId?: string,
): Promise<CollectionView> {
  await assertArTenantModule(ctx);

  const receivablePreview = await prisma.receivable.findUnique({
    where: { id: input.receivableId },
    select: { tenantId: true, projectId: true, companyId: true },
  });
  if (!receivablePreview) throw new ServiceError("NOT_FOUND", "Cuenta por cobrar no encontrada");
  if (receivablePreview.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (!canMutateArForScope(ctx.roles, receivablePreview.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para registrar cobranzas");
  }
  if (isCrossCompany(receivablePreview.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La cuenta no pertenece a la empresa activa");
  }
  if (projectScopeId !== undefined && receivablePreview.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La cuenta por cobrar no pertenece a este proyecto");
  }
  if (receivablePreview.projectId) {
    await assertProjectAllowsOperationalMutation(receivablePreview.projectId, ctx.tenantId);
  }

  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const collectionInclude = { account: { select: { name: true } } } as const;

  const collection = await withIdempotentCreate({
    findExisting: () =>
      prisma.collection.findFirst({
        where: { tenantId: ctx.tenantId, idempotencyKey },
        include: collectionInclude,
      }),
    payloadsMatch: (existing) =>
      collectionReplayMatches(existing, {
        receivableId: input.receivableId,
        accountId: input.accountId,
        collectionDate: input.collectionDate,
        collectFullBalance: Boolean(input.collectFullBalance),
        amount: input.amount,
      }),
    create: async () => {
      return prisma.$transaction(async (tx) => {
        // Load receivable inside txn for consistency
        const receivable = await tx.receivable.findUnique({ where: { id: input.receivableId } });
        if (!receivable) throw new ServiceError("NOT_FOUND", "Cuenta por cobrar no encontrada");
        assertResourceTenant(receivable.tenantId, ctx.tenantId);
        if (receivable.status === "CANCELLED") {
          throw new ServiceError("CONFLICT", "No se puede cobrar una cuenta por cobrar cancelada");
        }
        if (receivable.status === "PAID") {
          throw new ServiceError("CONFLICT", "La cuenta por cobrar ya está totalmente cobrada");
        }

        const salesInvoice = await tx.salesInvoice.findUnique({
          where: { id: receivable.salesInvoiceId },
          select: { status: true, number: true },
        });
        if (!salesInvoice) {
          throw new ServiceError("CONFLICT", "La factura de venta asociada no existe");
        }
        if (salesInvoice.status === "CANCELLED") {
          throw new ServiceError("CONFLICT", "No se puede cobrar una factura de venta cancelada");
        }

        const balanceDue = receivable.originalAmount.minus(receivable.paidAmount);
        // D-053: collectFullBalance applies stored balance; never round-then-reapply from UI.
        let amount: Prisma.Decimal;
        if (input.collectFullBalance) {
          amount = balanceDue;
        } else {
          const partial = toMoneyDecimal(input.amount ?? "0");
          amount = partial.eq(toMoneyDecimal(balanceDue)) ? balanceDue : partial;
        }
        if (amount.lessThanOrEqualTo(0)) {
          throw new ServiceError("VALIDATION", "El monto debe ser mayor a 0");
        }
        // BR-TRZ-006: block overpayment
        if (amount.greaterThan(balanceDue)) {
          throw new ServiceError(
            "CONFLICT",
            `El monto (${amount}) supera el saldo pendiente (${balanceDue}). No se permiten sobrepagos.`,
          );
        }

        // Currency + company scope guard (mirror AP payment)
        await lockTreasuryAccountRow(tx, input.accountId, ctx.tenantId);
        const account = await tx.treasuryAccount.findUnique({ where: { id: input.accountId } });
        if (!account) throw new ServiceError("NOT_FOUND", "Cuenta de tesorería no encontrada");
        assertResourceTenant(account.tenantId, ctx.tenantId);
        if (isCrossCompany(account.companyId, ctx)) {
          throw new ServiceError(
            "FORBIDDEN",
            "La cuenta de tesorería no pertenece a la empresa activa.",
          );
        }
        if (
          account.companyId
          && receivable.companyId
          && account.companyId !== receivable.companyId
        ) {
          throw new ServiceError(
            "FORBIDDEN",
            "La cuenta de tesorería pertenece a otra empresa que la cuenta por cobrar.",
          );
        }
        if (account.status !== "ACTIVE") {
          throw new ServiceError("CONFLICT", "La cuenta de tesorería no está activa");
        }
        assertTreasuryAccountCurrencyMatches(account.currency, receivable.currency);

        const companyId = ctx.companyId ?? account.companyId ?? receivable.companyId;
        if (!companyId) {
          throw new ServiceError(
            "VALIDATION",
            "La cobranza requiere una empresa activa en el contexto, la cuenta o la CxC",
          );
        }

        await assertPeriodOpenUnderCompanyLock(tx, {
          tenantId: ctx.tenantId,
          companyId,
          date: input.collectionDate,
        });
        const fx = computeDocumentFxAmounts(receivable.currency, amount);

        // Create Collection
        const created = await tx.collection.create({
          data: {
            tenantId:       ctx.tenantId,
            companyId,
            projectId:      receivable.projectId,
            clientContactId: receivable.clientContactId,
            receivableId:   receivable.id,
            salesInvoiceId: receivable.salesInvoiceId,
            accountId:      input.accountId,
            collectionDate: new Date(input.collectionDate),
            currency:       receivable.currency,
            amount,
            fxRate:         fx.fxRate,
            amountArs:      fx.amountArs,
            paymentMethod:  input.paymentMethod ?? null,
            reference:      input.reference ?? null,
            notes:          input.notes ?? null,
            idempotencyKey,
            status:         "CONFIRMED",
            createdBy:      ctx.actorUserId,
            updatedBy:      ctx.actorUserId,
          },
        });

        // Create AccountMovement INFLOW
        await tx.accountMovement.create({
          data: {
            tenantId:    ctx.tenantId,
            companyId:   account.companyId ?? companyId,
            projectId:   receivable.projectId,
            accountId:   input.accountId,
            movementDate: new Date(input.collectionDate),
            type:        "INFLOW",
            sourceType:  "COLLECTION",
            sourceId:    created.id,
            currency:    receivable.currency,
            amount,
            description: `Cobranza factura ${receivable.salesInvoiceId}`,
            status:      "CONFIRMED",
            createdBy:   ctx.actorUserId,
          },
        });

        // Update Receivable
        const newPaid = effectiveObligationPaidAfterPayment(
          receivable.originalAmount,
          receivable.paidAmount.plus(amount),
        );
        const newStatus = resolveObligationStoredStatus(newPaid, receivable.originalAmount);

        const receivableUpdate = await tx.receivable.updateMany({
          where: {
            id: receivable.id,
            paidAmount: receivable.paidAmount,
            status: { in: [...ACTIVE_OBLIGATION_STATUSES] },
          },
          data: { paidAmount: newPaid, status: newStatus, updatedBy: ctx.actorUserId },
        });
        assertOptimisticRowUpdate(
          receivableUpdate.count,
          "El saldo cambió mientras registrabas la cobranza. Revisá el saldo pendiente e intentá de nuevo.",
        );

        const result = await tx.collection.findUniqueOrThrow({
          where: { id: created.id },
          include: collectionInclude,
        });

        await auditAr(
          ctx,
          "collection.confirmed",
          "Collection",
          result.id,
          { projectId: result.projectId, companyId: result.companyId },
          {
            after: {
              receivableId: input.receivableId,
              amount: serializeMoneyDecimal(amount),
              collectFullBalance: Boolean(input.collectFullBalance),
              number: salesInvoice.number,
            },
            tx,
          },
        );

        return result;
      });
    },
  });

  await ensureDraftJournalFromCollection(collection.id, ctx);
  return serialize(collection);
}

export async function cancelCollection(
  id: string,
  ctx: ServiceContext,
  projectScopeId?: string,
): Promise<Collection> {
  await assertArTenantModule(ctx);

  const collectionPreview = await prisma.collection.findUnique({
    where: { id },
    select: {
      tenantId: true,
      projectId: true,
      companyId: true,
      collectionDate: true,
      status: true,
    },
  });
  if (!collectionPreview) throw new ServiceError("NOT_FOUND", "Cobranza no encontrada");
  if (collectionPreview.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  if (isCrossCompany(collectionPreview.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La cobranza no pertenece a la empresa activa");
  }
  if (!canMutateArForScope(ctx.roles, collectionPreview.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar cobranzas");
  }
  if (projectScopeId !== undefined && collectionPreview.projectId !== projectScopeId) {
    throw new ServiceError("FORBIDDEN", "La cobranza no pertenece a este proyecto");
  }

  const glParams = {
    companyId: collectionPreview.companyId,
    sourceType: "COLLECTION" as const,
    sourceId: id,
    sourceLabel: "la cobranza",
  };

  if (collectionPreview.status === "CANCELLED") {
    await cancelDraftJournalOnOperationalCancel(ctx, glParams);
    throw new ServiceError("CONFLICT", "La cobranza ya está cancelada");
  }

  await assertFinancialPeriodOpen({
    tenantId: ctx.tenantId,
    companyId: collectionPreview.companyId,
    date: collectionPreview.collectionDate,
  });

  // Hard stops before GL cancel — avoid orphaning DRAFT journals on RECONCILED conflict.
  const linkedMovementPreview = await prisma.accountMovement.findFirst({
    where: { sourceType: "COLLECTION", sourceId: id, status: { in: ["CONFIRMED", "RECONCILED"] } },
    select: { id: true, status: true },
  });
  if (linkedMovementPreview?.status === "RECONCILED") {
    throw new ServiceError(
      "CONFLICT",
      "El movimiento de tesorería está conciliado. Desconciliá antes de cancelar la cobranza.",
    );
  }

  await assertJournalAllowsOperationalCancel(ctx, glParams);

  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.collection.findUnique({ where: { id } });
    if (!c) throw new ServiceError("NOT_FOUND", "Cobranza no encontrada");
    if (c.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (projectScopeId !== undefined && c.projectId !== projectScopeId) {
      throw new ServiceError("FORBIDDEN", "La cobranza no pertenece a este proyecto");
    }
    if (c.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "La cobranza ya está cancelada");
    }

    await assertPeriodOpenUnderCompanyLock(tx, {
      tenantId: ctx.tenantId,
      companyId: c.companyId,
      date: c.collectionDate,
    });

    const linkedMovement = await tx.accountMovement.findFirst({
      where: { sourceType: "COLLECTION", sourceId: id, status: { in: ["CONFIRMED", "RECONCILED"] } },
      select: { id: true, status: true },
    });
    if (linkedMovement?.status === "RECONCILED") {
      throw new ServiceError(
        "CONFLICT",
        "El movimiento de tesorería está conciliado. Desconciliá antes de cancelar la cobranza.",
      );
    }

    const collectionCancel = await tx.collection.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "CONFIRMED" },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      collectionCancel.count,
      "La cobranza ya fue cancelada o modificada. Revisá e intentá de nuevo.",
    );

    // Cancel linked AccountMovement (tenant + optimistic claim if present)
    if (linkedMovement) {
      const movementCancel = await tx.accountMovement.updateMany({
        where: {
          id: linkedMovement.id,
          tenantId: ctx.tenantId,
          sourceType: "COLLECTION",
          sourceId: id,
          status: "CONFIRMED",
        },
        data: { status: "CANCELLED" },
      });
      assertOptimisticRowUpdate(
        movementCancel.count,
        "El movimiento de tesorería cambió (p. ej. conciliado). Recargá e intentá de nuevo.",
      );
    }

    // Reverse Receivable.paidAmount
    const receivable = await tx.receivable.findUnique({ where: { id: c.receivableId } });
    if (receivable && receivable.status !== "CANCELLED") {
      const newPaid = Prisma.Decimal.max(receivable.paidAmount.minus(c.amount), new Prisma.Decimal(0));
      const newStatus = resolveObligationStoredStatus(newPaid, receivable.originalAmount);
      const receivableReverse = await tx.receivable.updateMany({
        where: {
          id: receivable.id,
          paidAmount: receivable.paidAmount,
          status: { not: "CANCELLED" },
        },
        data: { paidAmount: newPaid, status: newStatus, updatedBy: ctx.actorUserId },
      });
      assertOptimisticRowUpdate(
        receivableReverse.count,
        "El saldo cambió mientras cancelabas la cobranza. Revisá e intentá de nuevo.",
      );
    }

    const invoice = await tx.salesInvoice.findUnique({
      where: { id: c.salesInvoiceId },
      select: { number: true },
    });

    const updated = await tx.collection.findUniqueOrThrow({ where: { id } });

    await auditAr(
      ctx,
      "collection.cancelled",
      "Collection",
      id,
      { projectId: updated.projectId, companyId: updated.companyId },
      { after: { status: "CANCELLED", number: invoice?.number ?? null }, tx },
    );

    return updated;
  });

  await cancelDraftJournalOnOperationalCancel(ctx, glParams);

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

type RawCollection = Collection & { account: { name: string } };

function serialize(c: RawCollection): CollectionView {
  return { ...c, amount: serializeMoneyDecimal(c.amount), accountName: c.account.name };
}
