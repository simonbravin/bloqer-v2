import { randomUUID } from "crypto";
import { Prisma, prisma, type AccountMovement, type InternalTransfer } from "@bloqer/database";
import { can, hasCompanyFinanceRole } from "@bloqer/domain";
import { createInternalTransferSchema, type CreateInternalTransferInput } from "@bloqer/validators";
import { auditTreasury } from "./treasury-audit";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { getAccountBalance } from "./balance.service";
import { serializeFxRateDecimal, serializeMoneyDecimal } from "../finance/money-decimal";
import { resolvePagination } from "../finance/pagination";
import { ensureDraftJournalFromInternalTransfer } from "../accounting/accounting-auto-draft.service";
import {
  assertJournalAllowsOperationalCancel,
  cancelDraftJournalOnOperationalCancel,
} from "../accounting/accounting-cancel-sync.service";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import {
  assertTreasuryAccountCanReverse,
  assertTreasuryPeriodsOpenUnderCompanyLocks,
  lockTreasuryAccountRow,
} from "./treasury-write-locks";
import { isCrossCompany } from "../company-scope";
import {
  requireIdempotencyKey,
  transferReplayMatches,
  withIdempotentCreate,
} from "../idempotency/idempotency";
import { computeTreasuryFxSnapshot, treasuryFxReplayMatches } from "./treasury-fx";

export type InternalTransferView = Omit<InternalTransfer, "amount"> & {
  amount: string;
  fxRate: string | null;
  amountArs: string | null;
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

type TransferDb = Prisma.TransactionClient | typeof prisma;

const accountSelect = { name: true, tenantId: true, companyId: true, currency: true } as const;
const transferInclude = {
  sourceAccount: { select: accountSelect },
  destinationAccount: { select: accountSelect },
} as const;
type TransferWithAccounts = Prisma.InternalTransferGetPayload<{ include: typeof transferInclude }>;
type TransferLeg = Pick<AccountMovement,
  "id" | "type" | "accountId" | "companyId" | "sourceType" | "sourceId" | "transferId" |
  "movementDate" | "valueDate" | "currency" | "amount" | "fxRate" | "amountArs" | "status"
>;

function scopedTransferWhere(tenantId: string): Prisma.InternalTransferWhereInput {
  return { tenantId, sourceAccount: { tenantId }, destinationAccount: { tenantId }, company: { tenantId } };
}

async function loadTransferLegs(
  db: TransferDb,
  tenantId: string,
  transferIds: string[],
): Promise<Map<string, TransferLeg[]>> {
  const byTransferId = new Map<string, TransferLeg[]>(transferIds.map(id => [id, []]));
  if (transferIds.length === 0) return byTransferId;
  const movements = await db.accountMovement.findMany({
    where: {
      tenantId,
      sourceType: "INTERNAL_TRANSFER",
      account: { tenantId },
      // Old rows may use a separate transferId for the pair. sourceId is the root id.
      OR: [{ sourceId: { in: transferIds } }, { transferId: { in: transferIds } }],
    },
    select: {
      id: true,
      type: true,
      accountId: true,
      companyId: true,
      sourceType: true,
      sourceId: true,
      transferId: true,
      movementDate: true,
      valueDate: true,
      currency: true,
      amount: true,
      fxRate: true,
      amountArs: true,
      status: true,
    },
  });
  for (const movement of movements) {
    const linked = movement.sourceId ? byTransferId.get(movement.sourceId) : undefined;
    const legacyLinked = movement.transferId ? byTransferId.get(movement.transferId) : undefined;
    (linked ?? legacyLinked)?.push(movement);
  }
  return byTransferId;
}

function matchTransferLegs(
  transfer: TransferWithAccounts,
  legs: readonly TransferLeg[],
): [TransferLeg, TransferLeg] | null {
  if (legs.length !== 2) return null;
  const out = legs.find(leg => leg.type === "TRANSFER_OUT");
  const inn = legs.find(leg => leg.type === "TRANSFER_IN");
  if (!out || !inn || out.accountId === inn.accountId || !out.transferId || out.transferId !== inn.transferId) return null;
  if (out.accountId !== transfer.sourceAccountId || inn.accountId !== transfer.destinationAccountId) return null;
  for (const [leg, account] of [[out, transfer.sourceAccount], [inn, transfer.destinationAccount]] as const) {
    if (leg.sourceId !== transfer.id && (leg.sourceId !== null || leg.transferId !== transfer.id)) return null;
    if (account.currency !== transfer.currency || leg.currency !== transfer.currency || !leg.amount.equals(transfer.amount)) return null;
    if (leg.movementDate.getTime() !== transfer.transferDate.getTime()) return null;
    if (leg.valueDate?.getTime() !== transfer.valueDate?.getTime()) return null;
    if (leg.companyId != null && leg.companyId !== (account.companyId ?? transfer.companyId)) return null;
  }
  return [out, inn];
}

function serialize(transfer: TransferWithAccounts, legs: TransferLeg[]): InternalTransferView {
  const { sourceAccount, destinationAccount, ...row } = transfer;
  const matched = matchTransferLegs(transfer, legs);
  const [out, inn] = matched ?? [];
  const knownFx = out?.fxRate && inn?.fxRate && out.fxRate.equals(inn.fxRate) &&
    out.amountArs && inn.amountArs && out.amountArs.equals(inn.amountArs)
    ? { rate: out.fxRate, amountArs: out.amountArs }
    : null;
  return {
    ...row,
    amount: serializeMoneyDecimal(row.amount),
    fxRate: knownFx ? serializeFxRateDecimal(knownFx.rate) : null,
    amountArs: knownFx ? serializeMoneyDecimal(knownFx.amountArs) : null,
    sourceAccountName: sourceAccount.name,
    destinationAccountName: destinationAccount.name,
  };
}

export async function getInternalTransferById(
  id: string,
  ctx: ServiceContext,
): Promise<InternalTransferView> {
  await assertTreasuryTenantModule(ctx);
  assertCanViewInternalTransfers(ctx.roles);
  const transfer = await prisma.internalTransfer.findFirst({
    where: { id, ...scopedTransferWhere(ctx.tenantId) },
    include: transferInclude,
  });
  if (!transfer) throw new ServiceError("NOT_FOUND", "Transferencia no encontrada");
  const legs = await loadTransferLegs(prisma, ctx.tenantId, [id]);
  return serialize(transfer, legs.get(id) ?? []);
}

export async function listInternalTransfers(
  ctx: ServiceContext,
  opts?: { page?: number; pageSize?: number },
): Promise<{ data: InternalTransferView[]; total: number }> {
  await assertTreasuryTenantModule(ctx);
  assertCanViewInternalTransfers(ctx.roles);

  const where = scopedTransferWhere(ctx.tenantId);
  const { skip, take } = resolvePagination(opts);
  const [rows, total] = await Promise.all([
    prisma.internalTransfer.findMany({
      where,
      include: transferInclude,
      orderBy: [{ transferDate: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.internalTransfer.count({ where }),
  ]);
  const legs = await loadTransferLegs(prisma, ctx.tenantId, rows.map(row => row.id));
  return { data: rows.map(row => serialize(row, legs.get(row.id) ?? [])), total };
}

export async function createInternalTransfer(
  rawInput: CreateInternalTransferInput,
  ctx: ServiceContext,
): Promise<InternalTransferView> {
  await assertTreasuryTenantModule(ctx);
  assertCanEditInternalTransfers(ctx.roles);
  const parsed = createInternalTransferSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Transferencia inválida");
  }
  const input = parsed.data;
  if (input.sourceAccountId === input.destinationAccountId) {
    throw new ServiceError("CONFLICT", "La cuenta origen y destino deben ser diferentes");
  }
  const accountIds = [input.sourceAccountId, input.destinationAccountId].sort();
  const amount = new Prisma.Decimal(input.amount);
  const transferDate = new Date(input.transferDate);
  const valueDate = new Date(input.valueDate);
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const description = input.description ?? null;

  async function loadAccounts(db: TransferDb) {
    const accounts = await db.treasuryAccount.findMany({
      where: { id: { in: accountIds }, tenantId: ctx.tenantId },
      select: { ...accountSelect, id: true, status: true },
    });
    const source = accounts.find(account => account.id === input.sourceAccountId);
    const destination = accounts.find(account => account.id === input.destinationAccountId);
    if (!source || !destination) throw new ServiceError("NOT_FOUND", "Cuenta de transferencia no encontrada");
    if (isCrossCompany(source.companyId, ctx) || isCrossCompany(destination.companyId, ctx)) {
      throw new ServiceError("FORBIDDEN", "Las cuentas de la transferencia no pertenecen a la empresa activa");
    }
    if (source.currency !== destination.currency) {
      throw new ServiceError(
        "CONFLICT",
        `Monedas diferentes (${source.currency} → ${destination.currency}). Las cuentas deben tener la misma moneda.`,
      );
    }
    const companyId = ctx.companyId ?? source.companyId ?? destination.companyId;
    if (!companyId) {
      throw new ServiceError(
        "VALIDATION",
        "La transferencia requiere una empresa activa en el contexto o en las cuentas",
      );
    }
    return { source, destination, companyId };
  }

  const preview = await loadAccounts(prisma);
  const fx = computeTreasuryFxSnapshot(preview.source.currency, amount, input.fxRate);
  const result = await withIdempotentCreate({
    findExisting: async () => {
      const transfer = await prisma.internalTransfer.findFirst({
        where: { ...scopedTransferWhere(ctx.tenantId), idempotencyKey },
        include: transferInclude,
      });
      if (!transfer) return null;
      const groupedLegs = await loadTransferLegs(prisma, ctx.tenantId, [transfer.id]);
      return { transfer, legs: groupedLegs.get(transfer.id) ?? [] };
    },
    payloadsMatch: ({ transfer, legs }) => {
      if (transfer.companyId !== preview.companyId || transfer.description !== description ||
          transfer.valueDate?.getTime() !== valueDate.getTime()) return false;
      const matched = matchTransferLegs(transfer, legs);
      return matched != null && matched.every(leg =>
        (leg.status === "CONFIRMED" || leg.status === "RECONCILED") && treasuryFxReplayMatches(leg, fx),
      ) && transferReplayMatches(transfer, input);
    },
    create: () => prisma.$transaction(async (tx) => {
      await assertTreasuryPeriodsOpenUnderCompanyLocks(tx, ctx.tenantId, [
        { companyId: preview.companyId, date: transferDate },
        { companyId: preview.source.companyId, date: transferDate },
        { companyId: preview.destination.companyId, date: transferDate },
      ]);
      for (const accountId of accountIds) {
        await lockTreasuryAccountRow(tx, accountId, ctx.tenantId);
      }
      const { source, destination, companyId } = await loadAccounts(tx);
      if (source.status !== "ACTIVE") throw new ServiceError("CONFLICT", "La cuenta origen no está activa");
      if (destination.status !== "ACTIVE") throw new ServiceError("CONFLICT", "La cuenta destino no está activa");
      if (
        companyId !== preview.companyId || source.companyId !== preview.source.companyId ||
        destination.companyId !== preview.destination.companyId || source.currency !== preview.source.currency
      ) {
        throw new ServiceError("CONFLICT", "Las cuentas cambiaron. Recargá e intentá de nuevo.");
      }
      const sourceBalance = await getAccountBalance(source.id, tx);
      if (amount.greaterThan(sourceBalance)) {
        throw new ServiceError(
          "CONFLICT",
          `Saldo insuficiente en cuenta origen. Disponible: ${serializeMoneyDecimal(sourceBalance)} ${source.currency}.`,
        );
      }

      const transfer = await tx.internalTransfer.create({
        data: {
          id: randomUUID(),
          tenantId: ctx.tenantId,
          companyId,
          sourceAccountId: source.id,
          destinationAccountId: destination.id,
          transferDate,
          valueDate,
          currency: source.currency,
          amount,
          description,
          idempotencyKey,
          status: "CONFIRMED",
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
        include: transferInclude,
      });

      const common = {
        tenantId: ctx.tenantId,
        movementDate: transferDate,
        valueDate,
        sourceType: "INTERNAL_TRANSFER" as const,
        sourceId: transfer.id,
        currency: transfer.currency,
        amount,
        ...fx,
        status: "CONFIRMED" as const,
        transferId: transfer.id,
        createdBy: ctx.actorUserId,
      };
      const legs = [
        {
          ...common, id: randomUUID(), companyId: source.companyId ?? companyId,
          accountId: source.id, type: "TRANSFER_OUT" as const, description: `Transferencia a ${destination.name}`,
        },
        {
          ...common, id: randomUUID(), companyId: destination.companyId ?? companyId,
          accountId: destination.id, type: "TRANSFER_IN" as const, description: `Transferencia desde ${source.name}`,
        },
      ];
      await tx.accountMovement.createMany({ data: legs });
      await auditTreasury(
        ctx, "internal_transfer.created", "InternalTransfer", transfer.id, { companyId },
        {
          after: {
            sourceAccountId: source.id,
            destinationAccountId: destination.id,
            amount: input.amount,
            transferDate: input.transferDate,
            valueDate: input.valueDate,
            fxRate: serializeFxRateDecimal(fx.fxRate),
            amountArs: serializeMoneyDecimal(fx.amountArs),
          },
          tx,
        },
      );
      return { transfer, legs };
    }, { timeout: 30_000 }),
  });

  await ensureDraftJournalFromInternalTransfer(result.transfer.id, ctx);
  return serialize(result.transfer, result.legs);
}

export async function cancelInternalTransfer(
  id: string,
  ctx: ServiceContext,
): Promise<InternalTransfer> {
  await assertTreasuryTenantModule(ctx);
  assertCanEditInternalTransfers(ctx.roles);

  return prisma.$transaction(async (tx) => {
    const transfer = await tx.internalTransfer.findFirst({
      where: { id, ...scopedTransferWhere(ctx.tenantId) },
      include: transferInclude,
    });
    if (!transfer) throw new ServiceError("NOT_FOUND", "Transferencia no encontrada");
    if (transfer.status !== "CONFIRMED") throw new ServiceError("CONFLICT", "La transferencia ya está cancelada");
    const byId = await loadTransferLegs(tx, ctx.tenantId, [id]);
    const legs = matchTransferLegs(transfer, byId.get(id) ?? []);
    if (!legs) throw new ServiceError("CONFLICT", "La transferencia no tiene un par de movimientos válido");
    if (legs.some(leg => leg.status !== "CONFIRMED")) {
      throw new ServiceError(
        "CONFLICT",
        "Los dos movimientos deben estar confirmados. Si uno está conciliado, desconcilialo antes de cancelar.",
      );
    }
    await assertTreasuryPeriodsOpenUnderCompanyLocks(tx, ctx.tenantId, [
      { companyId: transfer.companyId, date: transfer.transferDate },
      ...legs.map(leg => ({ companyId: leg.companyId, date: leg.movementDate })),
    ]);
    const glParams = {
      companyId: transfer.companyId,
      sourceType: "INTERNAL_TRANSFER" as const,
      sourceId: id,
      sourceLabel: "la transferencia",
      enforceCompanyScope: false,
    };
    await assertJournalAllowsOperationalCancel(ctx, glParams, tx);
    for (const accountId of [transfer.sourceAccountId, transfer.destinationAccountId].sort()) {
      await assertTreasuryAccountCanReverse(tx, accountId, ctx.tenantId);
    }
    const transferFlip = await tx.internalTransfer.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "CONFIRMED" },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(transferFlip.count, "La transferencia ya está cancelada. Recargá e intentá de nuevo.");

    const legsFlip = await tx.accountMovement.updateMany({
      where: { id: { in: legs.map(leg => leg.id) }, tenantId: ctx.tenantId, status: "CONFIRMED" },
      data: { status: "CANCELLED" },
    });
    if (legsFlip.count !== 2) {
      throw new ServiceError(
        "CONFLICT",
        "No se pudieron cancelar ambos movimientos. Desconciliá e intentá de nuevo.",
      );
    }
    await cancelDraftJournalOnOperationalCancel(ctx, glParams, tx);
    await auditTreasury(
      ctx, "internal_transfer.cancelled", "InternalTransfer", id, { companyId: transfer.companyId },
      { after: { status: "CANCELLED", amount: serializeMoneyDecimal(transfer.amount) }, tx },
    );
    return tx.internalTransfer.findUniqueOrThrow({ where: { id } });
  }, { timeout: 30_000 });
}
