import { Prisma, prisma, Collection } from "@bloqer/database";
import { canEditArArea, canViewArProjectArea } from "../ar/ar-access";
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
import { ServiceContext, ServiceError } from "../types";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";

export type CollectionView = Omit<Collection, "amount"> & {
  amount: string;
  accountName: string;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getCollectionById(
  id: string,
  ctx: ServiceContext,
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
): Promise<CollectionView[]> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
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
): Promise<CollectionView> {
  await assertArTenantModule(ctx);
  if (!canEditArArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para registrar cobranzas");
  }

  const receivablePreview = await prisma.receivable.findUnique({
    where: { id: input.receivableId },
    select: { tenantId: true, projectId: true, companyId: true },
  });
  if (!receivablePreview) throw new ServiceError("NOT_FOUND", "Cuenta por cobrar no encontrada");
  if (receivablePreview.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (ctx.companyId && receivablePreview.companyId !== ctx.companyId) {
    throw new ServiceError("FORBIDDEN", "La cuenta no pertenece a la empresa activa");
  }
  if (receivablePreview.projectId) {
    await assertProjectAllowsOperationalMutation(receivablePreview.projectId, ctx.tenantId);
  }

  const result = await prisma.$transaction(async (tx) => {
    // Load receivable inside txn for consistency
    const receivable = await tx.receivable.findUnique({ where: { id: input.receivableId } });
    if (!receivable) throw new ServiceError("NOT_FOUND", "Cuenta por cobrar no encontrada");
    if (receivable.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
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

    // Currency guard
    const account = await tx.treasuryAccount.findUnique({ where: { id: input.accountId } });
    if (!account) throw new ServiceError("NOT_FOUND", "Cuenta de tesorería no encontrada");
    if (account.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (account.status !== "ACTIVE") {
      throw new ServiceError("CONFLICT", "La cuenta de tesorería no está activa");
    }
    assertTreasuryAccountCurrencyMatches(account.currency, receivable.currency);

    const companyId = ctx.companyId ?? account.companyId ?? receivable.companyId;
    const fx = computeDocumentFxAmounts(receivable.currency, amount);

    // Create Collection
    const collection = await tx.collection.create({
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
        notes:          input.notes ?? null,
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
        sourceId:    collection.id,
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
      where: { id: collection.id },
      include: { account: { select: { name: true } } },
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

  return serialize(result);
}

export async function cancelCollection(
  id: string,
  ctx: ServiceContext,
): Promise<Collection> {
  await assertArTenantModule(ctx);
  if (!canEditArArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar cobranzas");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.collection.findUnique({ where: { id } });
    if (!c) throw new ServiceError("NOT_FOUND", "Cobranza no encontrada");
    if (c.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (c.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "La cobranza ya está cancelada");
    }

    const collectionCancel = await tx.collection.updateMany({
      where: { id, status: "CONFIRMED" },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      collectionCancel.count,
      "La cobranza ya fue cancelada o modificada. Revisá e intentá de nuevo.",
    );

    // Cancel linked AccountMovement
    await tx.accountMovement.updateMany({
      where: { sourceType: "COLLECTION", sourceId: id, status: "CONFIRMED" },
      data: { status: "CANCELLED" },
    });

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

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

type RawCollection = Collection & { account: { name: string } };

function serialize(c: RawCollection): CollectionView {
  return { ...c, amount: serializeMoneyDecimal(c.amount), accountName: c.account.name };
}
