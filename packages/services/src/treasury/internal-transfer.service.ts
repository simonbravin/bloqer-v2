import { randomUUID } from "crypto";
import { Prisma, prisma, InternalTransfer } from "@bloqer/database";
import { can, hasCompanyFinanceRole } from "@bloqer/domain";
import type { CreateInternalTransferInput } from "@bloqer/validators";
import { auditTreasury } from "./treasury-audit";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { getAccountBalance } from "./balance.service";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { ensureDraftJournalFromInternalTransfer } from "../accounting/accounting-auto-draft.service";
import {
  assertJournalAllowsOperationalCancel,
  cancelDraftJournalOnOperationalCancel,
} from "../accounting/accounting-cancel-sync.service";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { assertFinancialPeriodOpen } from "../finance/period-lock.service";
import {
  assertPeriodOpenUnderCompanyLock,
  lockTreasuryAccountRow,
} from "./treasury-write-locks";
import { isCrossCompany } from "../company-scope";
import {
  requireIdempotencyKey,
  transferReplayMatches,
  withIdempotentCreate,
} from "../idempotency/idempotency";

export type InternalTransferView = Omit<InternalTransfer, "amount"> & {
  amount: string;
  sourceAccountName: string;
  destinationAccountName: string;
};

function assertCanViewInternalTransfers(roles: ServiceContext["roles"]): void {
  if (
    !hasCompanyFinanceRole(roles)
    || (!can(roles, "VIEW", "INTERNAL_TRANSFERS") && !can(roles, "VIEW", "TREASURY"))
  ) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver transferencias");
  }
}

function assertCanEditInternalTransfers(roles: ServiceContext["roles"]): void {
  if (
    !hasCompanyFinanceRole(roles)
    || (!can(roles, "EDIT", "INTERNAL_TRANSFERS") && !can(roles, "EDIT", "TREASURY"))
  ) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para registrar transferencias");
  }
}

/** Pure BR-TRZ-004 shape: exactly two legs, same transferId, opposite types, same amount. */
export function buildInternalTransferLegs(params: {
  transferId: string;
  amount: string;
  sourceAccountId: string;
  destinationAccountId: string;
}): Array<{
  type: "TRANSFER_OUT" | "TRANSFER_IN";
  transferId: string;
  accountId: string;
  amount: string;
}> {
  return [
    {
      type: "TRANSFER_OUT",
      transferId: params.transferId,
      accountId: params.sourceAccountId,
      amount: params.amount,
    },
    {
      type: "TRANSFER_IN",
      transferId: params.transferId,
      accountId: params.destinationAccountId,
      amount: params.amount,
    },
  ];
}

export function assertInternalTransferLegsValid(
  legs: ReturnType<typeof buildInternalTransferLegs>,
): void {
  if (legs.length !== 2) {
    throw new ServiceError("VALIDATION", "Una transferencia interna debe generar exactamente 2 movimientos");
  }
  const [out, inn] = legs;
  if (!out || !inn) {
    throw new ServiceError("VALIDATION", "Una transferencia interna debe generar exactamente 2 movimientos");
  }
  if (out.type !== "TRANSFER_OUT" || inn.type !== "TRANSFER_IN") {
    throw new ServiceError("VALIDATION", "Los movimientos de transferencia deben ser TRANSFER_OUT y TRANSFER_IN");
  }
  if (out.transferId !== inn.transferId) {
    throw new ServiceError("VALIDATION", "Ambos movimientos deben compartir el mismo transferId");
  }
  if (out.amount !== inn.amount) {
    throw new ServiceError("VALIDATION", "Ambos movimientos deben tener el mismo monto");
  }
  if (out.accountId === inn.accountId) {
    throw new ServiceError("VALIDATION", "Origen y destino deben ser cuentas distintas");
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getInternalTransferById(
  id: string,
  ctx: ServiceContext,
): Promise<InternalTransferView> {
  await assertTreasuryTenantModule(ctx);
  assertCanViewInternalTransfers(ctx.roles);
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

export async function listInternalTransfers(
  ctx: ServiceContext,
  opts?: { page?: number; pageSize?: number },
): Promise<{ data: InternalTransferView[]; total: number }> {
  await assertTreasuryTenantModule(ctx);
  assertCanViewInternalTransfers(ctx.roles);

  const where = { tenantId: ctx.tenantId };
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;

  const [rows, total] = await Promise.all([
    prisma.internalTransfer.findMany({
      where,
      include: {
        sourceAccount:      { select: { name: true } },
        destinationAccount: { select: { name: true } },
      },
      orderBy: { transferDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.internalTransfer.count({ where }),
  ]);

  return { data: rows.map(serialize), total };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createInternalTransfer(
  input: CreateInternalTransferInput,
  ctx: ServiceContext,
): Promise<InternalTransferView> {
  await assertTreasuryTenantModule(ctx);
  assertCanEditInternalTransfers(ctx.roles);

  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new ServiceError("VALIDATION", "El monto debe ser mayor a 0");
  }
  if (input.sourceAccountId === input.destinationAccountId) {
    throw new ServiceError("CONFLICT", "La cuenta origen y destino deben ser diferentes");
  }

  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const transferInclude = {
    sourceAccount:      { select: { name: true } },
    destinationAccount: { select: { name: true } },
  } as const;

  const result = await withIdempotentCreate({
    findExisting: () =>
      prisma.internalTransfer.findFirst({
        where: { tenantId: ctx.tenantId, idempotencyKey },
        include: transferInclude,
      }),
    payloadsMatch: (existing) =>
      transferReplayMatches(existing, {
        sourceAccountId: input.sourceAccountId,
        destinationAccountId: input.destinationAccountId,
        transferDate: input.transferDate,
        amount: input.amount,
      }),
    create: async () => {
      return prisma.$transaction(async (tx) => {
    // Stable lock order avoids deadlocks when two transfers cross the same accounts.
    const accountIds = [input.sourceAccountId, input.destinationAccountId].sort();
    for (const accountId of accountIds) {
      await lockTreasuryAccountRow(tx, accountId, ctx.tenantId);
    }

    const source = await tx.treasuryAccount.findUnique({ where: { id: input.sourceAccountId } });
    const dest   = await tx.treasuryAccount.findUnique({ where: { id: input.destinationAccountId } });

    if (!source) throw new ServiceError("NOT_FOUND", "Cuenta origen no encontrada");
    if (!dest)   throw new ServiceError("NOT_FOUND", "Cuenta destino no encontrada");
    if (source.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (dest.tenantId   !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (isCrossCompany(source.companyId, ctx) || isCrossCompany(dest.companyId, ctx)) {
      throw new ServiceError(
        "FORBIDDEN",
        "Las cuentas de la transferencia no pertenecen a la empresa activa",
      );
    }
    if (source.status !== "ACTIVE") throw new ServiceError("CONFLICT", "La cuenta origen no está activa");
    if (dest.status   !== "ACTIVE") throw new ServiceError("CONFLICT", "La cuenta destino no está activa");

    // Same currency only (Phase 3C)
    if (source.currency !== dest.currency) {
      throw new ServiceError(
        "CONFLICT",
        `Monedas diferentes (${source.currency} → ${dest.currency}). Transferencias FX no disponibles en Phase 3C.`,
      );
    }

    const companyId = ctx.companyId ?? source.companyId ?? dest.companyId ?? null;
    if (!companyId) {
      throw new ServiceError(
        "VALIDATION",
        "La transferencia requiere una empresa activa en el contexto o en las cuentas",
      );
    }
    // Canonical pair id = InternalTransfer.id so GL draft + cancel sync share one sourceId.
    const transferPairId = randomUUID();

    await assertPeriodOpenUnderCompanyLock(tx, {
      tenantId: ctx.tenantId,
      companyId,
      date: input.transferDate,
    });

    // Balance check under account locks: block negative balance on source (D4)
    const sourceBalance = await getAccountBalance(source.id, tx as never);
    if (amount.greaterThan(sourceBalance)) {
      throw new ServiceError(
        "CONFLICT",
        `Saldo insuficiente en cuenta origen. Disponible: ${serializeMoneyDecimal(sourceBalance)} ${source.currency}.`,
      );
    }

    const transfer = await tx.internalTransfer.create({
      data: {
        id:                   transferPairId,
        tenantId:             ctx.tenantId,
        companyId,
        sourceAccountId:      source.id,
        destinationAccountId: dest.id,
        transferDate:         new Date(input.transferDate),
        currency:             source.currency,
        amount,
        description:          input.description ?? null,
        idempotencyKey,
        status:               "CONFIRMED",
        createdBy:            ctx.actorUserId,
        updatedBy:            ctx.actorUserId,
      },
    });

    // BR-TRZ-004: exactly 2 movements; transferId === InternalTransfer.id for GL linkage
    const legs = buildInternalTransferLegs({
      transferId: transfer.id,
      amount: serializeMoneyDecimal(amount),
      sourceAccountId: source.id,
      destinationAccountId: dest.id,
    });
    assertInternalTransferLegsValid(legs);

    await tx.accountMovement.createMany({
      data: [
        {
          tenantId:     ctx.tenantId,
          companyId:    source.companyId ?? companyId,
          accountId:    source.id,
          movementDate: new Date(input.transferDate),
          type:         "TRANSFER_OUT",
          sourceType:   "INTERNAL_TRANSFER",
          sourceId:     transfer.id,
          currency:     source.currency,
          amount,
          description:  `Transferencia a ${dest.name}`,
          status:       "CONFIRMED",
          transferId:   transfer.id,
          createdBy:    ctx.actorUserId,
        },
        {
          tenantId:     ctx.tenantId,
          companyId:    dest.companyId ?? companyId,
          accountId:    dest.id,
          movementDate: new Date(input.transferDate),
          type:         "TRANSFER_IN",
          sourceType:   "INTERNAL_TRANSFER",
          sourceId:     transfer.id,
          currency:     dest.currency,
          amount,
          description:  `Transferencia desde ${source.name}`,
          status:       "CONFIRMED",
          transferId:   transfer.id,
          createdBy:    ctx.actorUserId,
        },
      ],
    });

    const result = await tx.internalTransfer.findUniqueOrThrow({
      where: { id: transfer.id },
      include: transferInclude,
    });

    await auditTreasury(
      ctx,
      "internal_transfer.created",
      "InternalTransfer",
      result.id,
      { companyId: result.companyId },
      {
        after: {
          sourceAccountId: input.sourceAccountId,
          destinationAccountId: input.destinationAccountId,
          amount: input.amount,
        },
        tx,
      },
    );

    return result;
      });
    },
  });

  await ensureDraftJournalFromInternalTransfer(result.id, ctx);
  return serialize(result);
}

export async function cancelInternalTransfer(
  id: string,
  ctx: ServiceContext,
): Promise<InternalTransfer> {
  await assertTreasuryTenantModule(ctx);
  assertCanEditInternalTransfers(ctx.roles);

  const preview = await prisma.internalTransfer.findUnique({
    where: { id },
    select: { tenantId: true, companyId: true, status: true, transferDate: true },
  });
  if (!preview) throw new ServiceError("NOT_FOUND", "Transferencia no encontrada");
  if (preview.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const glParams = {
    companyId: preview.companyId,
    sourceType: "INTERNAL_TRANSFER" as const,
    sourceId: id,
    sourceLabel: "la transferencia",
    // Tesorería / transferencias son tenant-wide (TENANT_COMPANY_SCOPING §2.1).
    enforceCompanyScope: false as const,
  };

  if (preview.status === "CANCELLED") {
    await cancelDraftJournalOnOperationalCancel(ctx, glParams);
    throw new ServiceError("CONFLICT", "La transferencia ya está cancelada");
  }

  await assertFinancialPeriodOpen({
    tenantId: ctx.tenantId,
    companyId: preview.companyId,
    date: preview.transferDate,
  });

  const reconciledLegPreview = await prisma.accountMovement.findFirst({
    where: {
      sourceType: "INTERNAL_TRANSFER",
      sourceId: id,
      status: "RECONCILED",
    },
    select: { id: true },
  });
  if (reconciledLegPreview) {
    throw new ServiceError(
      "CONFLICT",
      "Un movimiento de la transferencia está conciliado. Desconciliá antes de cancelar.",
    );
  }

  await assertJournalAllowsOperationalCancel(ctx, glParams);

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.internalTransfer.findUnique({ where: { id } });
    if (!t) throw new ServiceError("NOT_FOUND", "Transferencia no encontrada");
    if (t.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (t.status === "CANCELLED") throw new ServiceError("CONFLICT", "La transferencia ya está cancelada");

    await assertPeriodOpenUnderCompanyLock(tx, {
      tenantId: ctx.tenantId,
      companyId: t.companyId,
      date: t.transferDate,
    });

    const reconciledLeg = await tx.accountMovement.findFirst({
      where: {
        sourceType: "INTERNAL_TRANSFER",
        sourceId: id,
        status: "RECONCILED",
      },
      select: { id: true },
    });
    if (reconciledLeg) {
      throw new ServiceError(
        "CONFLICT",
        "Un movimiento de la transferencia está conciliado. Desconciliá antes de cancelar.",
      );
    }

    const transferFlip = await tx.internalTransfer.updateMany({
      where: { id, tenantId: ctx.tenantId, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      transferFlip.count,
      "La transferencia ya está cancelada. Recargá e intentá de nuevo.",
    );

    // Cancel both linked movements (BR-TRZ-004)
    const legs = await tx.accountMovement.updateMany({
      where: {
        tenantId: ctx.tenantId,
        sourceType: "INTERNAL_TRANSFER",
        sourceId: id,
        status: "CONFIRMED",
      },
      data: { status: "CANCELLED" },
    });
    if (legs.count !== 2) {
      throw new ServiceError(
        "CONFLICT",
        "No se pudieron cancelar ambas piernas de la transferencia. Desconciliá e intentá de nuevo.",
      );
    }

    const updated = await tx.internalTransfer.findUniqueOrThrow({ where: { id } });

    await auditTreasury(
      ctx,
      "internal_transfer.cancelled",
      "InternalTransfer",
      id,
      { companyId: updated.companyId },
      { after: { status: "CANCELLED", amount: serializeMoneyDecimal(t.amount) }, tx },
    );

    return updated;
  });

  await cancelDraftJournalOnOperationalCancel(ctx, glParams);

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
    amount: serializeMoneyDecimal(t.amount),
    sourceAccountName:      t.sourceAccount.name,
    destinationAccountName: t.destinationAccount.name,
  };
}
