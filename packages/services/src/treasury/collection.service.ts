import { Prisma, prisma, Collection } from "@bloqer/database";
import { canEditArArea, canViewArProjectArea } from "../ar/ar-access";
import type { CreateCollectionInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertArTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";

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

export async function listCollectionsByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<CollectionView[]> {
  await assertArTenantModule(ctx);
  if (!canViewArProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cobranzas");
  }
  const rows = await prisma.collection.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    include: { account: { select: { name: true } } },
    orderBy: { collectionDate: "desc" },
  });
  return rows.map(serialize);
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

  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new ServiceError("VALIDATION", "El monto debe ser mayor a 0");
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

    const balanceDue = receivable.originalAmount.minus(receivable.paidAmount);
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
    if (account.currency !== receivable.currency) {
      throw new ServiceError(
        "CONFLICT",
        `Moneda de cuenta (${account.currency}) no coincide con la del saldo (${receivable.currency}). FX no disponible en Phase 3C.`,
      );
    }

    const companyId = ctx.companyId ?? account.companyId ?? receivable.companyId;

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
        companyId:   account.companyId,
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
    const newPaid = receivable.paidAmount.plus(amount);
    const newBalance = receivable.originalAmount.minus(newPaid);
    const newStatus = newBalance.isZero() ? "PAID"
      : newPaid.greaterThan(0) ? "PARTIAL"
      : "OPEN";

    await tx.receivable.update({
      where: { id: receivable.id },
      data: { paidAmount: newPaid, status: newStatus, updatedBy: ctx.actorUserId },
    });

    return tx.collection.findUniqueOrThrow({
      where: { id: collection.id },
      include: { account: { select: { name: true } } },
    });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "collection.confirmed",
    entityType: "Collection",
    entityId: result.id,
    after: { receivableId: input.receivableId, amount: input.amount },
    ipAddress: ctx.ipAddress,
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

    // Cancel linked AccountMovement
    await tx.accountMovement.updateMany({
      where: { sourceType: "COLLECTION", sourceId: id, status: "CONFIRMED" },
      data: { status: "CANCELLED" },
    });

    // Reverse Receivable.paidAmount
    const receivable = await tx.receivable.findUnique({ where: { id: c.receivableId } });
    if (receivable && receivable.status !== "CANCELLED") {
      const newPaid = Prisma.Decimal.max(receivable.paidAmount.minus(c.amount), new Prisma.Decimal(0));
      const newBalance = receivable.originalAmount.minus(newPaid);
      const newStatus = newBalance.isZero() ? "PAID"
        : newPaid.greaterThan(0) ? "PARTIAL"
        : "OPEN";
      await tx.receivable.update({
        where: { id: receivable.id },
        data: { paidAmount: newPaid, status: newStatus, updatedBy: ctx.actorUserId },
      });
    }

    return tx.collection.update({
      where: { id },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "collection.cancelled",
    entityType: "Collection",
    entityId: id,
    after: { status: "CANCELLED" },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

type RawCollection = Collection & { account: { name: string } };

function serialize(c: RawCollection): CollectionView {
  return { ...c, amount: c.amount.toString(), accountName: c.account.name };
}
