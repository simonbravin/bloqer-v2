import { Prisma, prisma, InternalTransfer } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateInternalTransferInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { getAccountBalance } from "./balance.service";

export type InternalTransferView = Omit<InternalTransfer, "amount"> & {
  amount: string;
  sourceAccountName: string;
  destinationAccountName: string;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getInternalTransferById(
  id: string,
  ctx: ServiceContext,
): Promise<InternalTransferView> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver transferencias");
  }
  const t = await prisma.internalTransfer.findUnique({
    where: { id },
    include: {
      sourceAccount:      { select: { name: true } },
      destinationAccount: { select: { name: true } },
    },
  });
  if (!t) throw new ServiceError("NOT_FOUND", "Transferencia no encontrada");
  if (t.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return serialize(t);
}

export async function listInternalTransfers(ctx: ServiceContext): Promise<InternalTransferView[]> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver transferencias");
  }
  const rows = await prisma.internalTransfer.findMany({
    where: { tenantId: ctx.tenantId },
    include: {
      sourceAccount:      { select: { name: true } },
      destinationAccount: { select: { name: true } },
    },
    orderBy: { transferDate: "desc" },
  });
  return rows.map(serialize);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createInternalTransfer(
  input: CreateInternalTransferInput,
  ctx: ServiceContext,
): Promise<InternalTransferView> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear transferencias");
  }

  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new ServiceError("VALIDATION", "El monto debe ser mayor a 0");
  }
  if (input.sourceAccountId === input.destinationAccountId) {
    throw new ServiceError("CONFLICT", "La cuenta origen y destino deben ser diferentes");
  }

  const result = await prisma.$transaction(async (tx) => {
    const source = await tx.treasuryAccount.findUnique({ where: { id: input.sourceAccountId } });
    const dest   = await tx.treasuryAccount.findUnique({ where: { id: input.destinationAccountId } });

    if (!source) throw new ServiceError("NOT_FOUND", "Cuenta origen no encontrada");
    if (!dest)   throw new ServiceError("NOT_FOUND", "Cuenta destino no encontrada");
    if (source.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (dest.tenantId   !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (source.status !== "ACTIVE") throw new ServiceError("CONFLICT", "La cuenta origen no está activa");
    if (dest.status   !== "ACTIVE") throw new ServiceError("CONFLICT", "La cuenta destino no está activa");

    // Same currency only (Phase 3C)
    if (source.currency !== dest.currency) {
      throw new ServiceError(
        "CONFLICT",
        `Monedas diferentes (${source.currency} → ${dest.currency}). Transferencias FX no disponibles en Phase 3C.`,
      );
    }

    // Balance check: block negative balance on source (D4)
    const sourceBalance = await getAccountBalance(source.id, tx as never);
    if (amount.greaterThan(sourceBalance)) {
      throw new ServiceError(
        "CONFLICT",
        `Saldo insuficiente en cuenta origen. Disponible: ${sourceBalance.toFixed(2)} ${source.currency}.`,
      );
    }

    const companyId = ctx.companyId ?? source.companyId ?? null;
    const transferId = crypto.randomUUID();

    const transfer = await tx.internalTransfer.create({
      data: {
        tenantId:             ctx.tenantId,
        companyId:            companyId ?? dest.companyId ?? "",
        sourceAccountId:      source.id,
        destinationAccountId: dest.id,
        transferDate:         new Date(input.transferDate),
        currency:             source.currency,
        amount,
        description:          input.description ?? null,
        status:               "CONFIRMED",
        createdBy:            ctx.actorUserId,
        updatedBy:            ctx.actorUserId,
      },
    });

    // BR-TRZ-004: exactly 2 movements linked by transferId
    await tx.accountMovement.createMany({
      data: [
        {
          tenantId:     ctx.tenantId,
          companyId:    source.companyId,
          accountId:    source.id,
          movementDate: new Date(input.transferDate),
          type:         "TRANSFER_OUT",
          sourceType:   "INTERNAL_TRANSFER",
          sourceId:     transfer.id,
          currency:     source.currency,
          amount,
          description:  `Transferencia a ${dest.name}`,
          status:       "CONFIRMED",
          transferId,
          createdBy:    ctx.actorUserId,
        },
        {
          tenantId:     ctx.tenantId,
          companyId:    dest.companyId,
          accountId:    dest.id,
          movementDate: new Date(input.transferDate),
          type:         "TRANSFER_IN",
          sourceType:   "INTERNAL_TRANSFER",
          sourceId:     transfer.id,
          currency:     dest.currency,
          amount,
          description:  `Transferencia desde ${source.name}`,
          status:       "CONFIRMED",
          transferId,
          createdBy:    ctx.actorUserId,
        },
      ],
    });

    return tx.internalTransfer.findUniqueOrThrow({
      where: { id: transfer.id },
      include: {
        sourceAccount:      { select: { name: true } },
        destinationAccount: { select: { name: true } },
      },
    });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "internal_transfer.created",
    entityType: "InternalTransfer",
    entityId: result.id,
    after: { sourceAccountId: input.sourceAccountId, destinationAccountId: input.destinationAccountId, amount: input.amount },
    ipAddress: ctx.ipAddress,
  });

  return serialize(result);
}

export async function cancelInternalTransfer(
  id: string,
  ctx: ServiceContext,
): Promise<InternalTransfer> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar transferencias");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.internalTransfer.findUnique({ where: { id } });
    if (!t) throw new ServiceError("NOT_FOUND", "Transferencia no encontrada");
    if (t.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (t.status === "CANCELLED") throw new ServiceError("CONFLICT", "La transferencia ya está cancelada");

    // Cancel both linked movements (BR-TRZ-004)
    await tx.accountMovement.updateMany({
      where: { sourceType: "INTERNAL_TRANSFER", sourceId: id, status: "CONFIRMED" },
      data: { status: "CANCELLED" },
    });

    return tx.internalTransfer.update({
      where: { id },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "internal_transfer.cancelled",
    entityType: "InternalTransfer",
    entityId: id,
    after: { status: "CANCELLED" },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

type RawTransfer = InternalTransfer & {
  sourceAccount:      { name: string };
  destinationAccount: { name: string };
};

function serialize(t: RawTransfer): InternalTransferView {
  return {
    ...t,
    amount: t.amount.toString(),
    sourceAccountName:      t.sourceAccount.name,
    destinationAccountName: t.destinationAccount.name,
  };
}
