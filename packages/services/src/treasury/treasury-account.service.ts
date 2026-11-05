import { Prisma, prisma, TreasuryAccount } from "@bloqer/database";
import { can, hasCompanyFinanceRole } from "@bloqer/domain";
import {
  createTreasuryAccountSchema,
  updateTreasuryAccountSchema,
  type CreateTreasuryAccountInput,
  type UpdateTreasuryAccountInput,
} from "@bloqer/validators";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import { auditTreasury } from "./treasury-audit";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { canRegisterApPayment } from "../ap/ap-access";
import { findActiveCompanyInTenant } from "../company/company.service";
import { ServiceContext, ServiceError } from "../types";
import { getAccountBalance } from "./balance.service";
import { serializeFxRateDecimal, serializeMoneyDecimal } from "../finance/money-decimal";
import {
  assertTreasuryPeriodsOpenUnderCompanyLocks,
  lockCompanyForFinancialWrite,
  lockTreasuryAccountRow,
} from "./treasury-write-locks";
import { resolvePagination } from "../finance/pagination";
import { computeTreasuryFxSnapshot } from "./treasury-fx";

export type TreasuryAccountView = Omit<TreasuryAccount, "openingBalance"> & {
  openingBalance: string;
  balance: string;
};

/** Account picker for cobranzas/pagos — no balances (D-056). */
export type TreasuryAccountOption = {
  id: string;
  name: string;
  currency: string;
  status: TreasuryAccount["status"];
  companyId: string | null;
};

function assertCanViewBankAccounts(roles: ServiceContext["roles"]): void {
  if (
    !hasCompanyFinanceRole(roles)
    || (!can(roles, "VIEW", "BANK_ACCOUNTS") && !can(roles, "VIEW", "TREASURY"))
  ) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas de tesorería");
  }
}

function assertCanEditBankAccounts(roles: ServiceContext["roles"]): void {
  if (
    !hasCompanyFinanceRole(roles)
    || (!can(roles, "EDIT", "BANK_ACCOUNTS") && !can(roles, "EDIT", "TREASURY"))
  ) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para gestionar cuentas de tesorería");
  }
}

function treasuryAccountScope(tenantId: string): Prisma.TreasuryAccountWhereInput {
  return { tenantId, OR: [{ companyId: null }, { company: { tenantId } }] };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getTreasuryAccountById(
  id: string,
  ctx: ServiceContext,
): Promise<TreasuryAccountView> {
  await assertTreasuryTenantModule(ctx);
  assertCanViewBankAccounts(ctx.roles);
  const acc = await prisma.treasuryAccount.findFirst({ where: { id, ...treasuryAccountScope(ctx.tenantId) } });
  if (!acc) throw new ServiceError("NOT_FOUND", "Cuenta no encontrada");
  const balance = await getAccountBalance(id);
  return serialize(acc, balance);
}

export async function listTreasuryAccounts(
  ctx: ServiceContext,
  opts?: { page?: number; pageSize?: number },
): Promise<{ data: TreasuryAccountView[]; total: number }> {
  await assertTreasuryTenantModule(ctx);
  assertCanViewBankAccounts(ctx.roles);

  const where = treasuryAccountScope(ctx.tenantId);
  const paginate = opts?.page !== undefined || opts?.pageSize !== undefined;
  const { skip, take } = resolvePagination(opts);

  const [accounts, total] = await Promise.all([
    prisma.treasuryAccount.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      ...(paginate ? { skip, take } : {}),
    }),
    prisma.treasuryAccount.count({ where }),
  ]);

  const data: TreasuryAccountView[] = [];
  for (const acc of accounts) {
    const balance = await getAccountBalance(acc.id);
    data.push(serialize(acc, balance));
  }
  return { data, total };
}

/**
 * Active accounts for payment/collection forms (project finance).
 * Does not expose balances — D-056.
 */
export async function listSelectableTreasuryAccounts(
  ctx: ServiceContext,
): Promise<TreasuryAccountOption[]> {
  await assertTreasuryTenantModule(ctx);
  const canPick =
    can(ctx.roles, "EDIT", "AR")
    || canRegisterApPayment(ctx.roles)
    || can(ctx.roles, "VIEW", "TREASURY")
    || can(ctx.roles, "VIEW", "BANK_ACCOUNTS");
  if (!canPick) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para seleccionar cuentas de tesorería");
  }

  const accounts = await prisma.treasuryAccount.findMany({
    where: { ...treasuryAccountScope(ctx.tenantId), status: "ACTIVE" },
    select: { id: true, name: true, currency: true, status: true, companyId: true },
    orderBy: { name: "asc" },
  });
  return accounts;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createTreasuryAccount(
  rawInput: CreateTreasuryAccountInput,
  ctx: ServiceContext,
): Promise<TreasuryAccountView> {
  await assertTreasuryTenantModule(ctx);
  assertCanEditBankAccounts(ctx.roles);
  const parsed = createTreasuryAccountSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Cuenta inválida");
  }
  const input = parsed.data;

  const openingBalance = new Prisma.Decimal(input.openingBalance ?? "0");
  const openingAmount = openingBalance.abs();
  const companyId = input.companyId ?? ctx.companyId ?? null;
  const currency = input.currency;

  // Period lock cannot apply without a company; require one when creating money.
  if (!openingAmount.isZero() && !companyId) {
    throw new ServiceError(
      "VALIDATION",
      "El saldo inicial requiere una empresa en el contexto o en la cuenta",
    );
  }
  const openingFx = openingAmount.isZero()
    ? null
    : computeTreasuryFxSnapshot(currency, openingAmount, input.openingFxRate);

  const acc = await prisma.$transaction(async (tx) => {
    if (companyId && !(await findActiveCompanyInTenant(companyId, ctx.tenantId, tx))) {
      throw new ServiceError("FORBIDDEN", "Empresa no disponible para esta cuenta de tesorería");
    }
    const movementDate = new Date(`${toIsoDateInTimeZone()}T00:00:00.000Z`);
    if (openingFx && companyId) {
      await assertTreasuryPeriodsOpenUnderCompanyLocks(tx, ctx.tenantId, [{ companyId, date: movementDate }]);
    }
    const created = await tx.treasuryAccount.create({
      data: {
        tenantId: ctx.tenantId,
        companyId,
        name: input.name,
        type: input.type,
        currency,
        bankName: input.bankName ?? null,
        accountNumber: input.accountNumber ?? null,
        alias: input.alias ?? null,
        notes: input.notes ?? null,
        openingBalance,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    // D-136: signed native balance; ledger stores the absolute amount with direction.
    if (openingFx && companyId) {
      await tx.accountMovement.create({
        data: {
          tenantId: ctx.tenantId,
          companyId,
          accountId: created.id,
          movementDate,
          type: openingBalance.isNegative() ? "OUTFLOW" : "INFLOW",
          sourceType: "OPENING_BALANCE",
          sourceId: created.id,
          currency: created.currency,
          amount: openingAmount,
          ...openingFx,
          description: "Saldo inicial",
          status: "CONFIRMED",
          createdBy: ctx.actorUserId,
        },
      });
    }

    await auditTreasury(
      ctx,
      "treasury_account.created",
      "TreasuryAccount",
      created.id,
      { companyId: created.companyId },
      {
        after: {
          name: input.name,
          type: input.type,
          currency,
          openingBalance: serializeMoneyDecimal(openingBalance),
          ...(openingFx ? { openingFxRate: serializeFxRateDecimal(openingFx.fxRate) } : {}),
        },
        tx,
      },
    );

    return created;
  }, { timeout: 30_000 });

  const balance = await getAccountBalance(acc.id);
  return serialize(acc, balance);
}

export async function updateTreasuryAccount(
  id: string,
  rawInput: UpdateTreasuryAccountInput,
  ctx: ServiceContext,
): Promise<TreasuryAccountView> {
  await assertTreasuryTenantModule(ctx);
  assertCanEditBankAccounts(ctx.roles);
  const parsed = updateTreasuryAccountSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Cuenta inválida");
  }
  const input = parsed.data;
  const acc = await prisma.treasuryAccount.findFirst({ where: { id, ...treasuryAccountScope(ctx.tenantId) } });
  if (!acc) throw new ServiceError("NOT_FOUND", "Cuenta no encontrada");
  if (acc.status === "CLOSED") throw new ServiceError("CONFLICT", "No se puede editar una cuenta cerrada");

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.treasuryAccount.updateMany({
      where: { id, tenantId: ctx.tenantId, status: { not: "CLOSED" } },
      data: {
        name: input.name,
        bankName: input.bankName,
        accountNumber: input.accountNumber,
        alias: input.alias,
        notes: input.notes,
        updatedBy: ctx.actorUserId,
      },
    });
    if (result.count !== 1) {
      throw new ServiceError("CONFLICT", "No se puede editar una cuenta cerrada");
    }
    const updatedAccount = await tx.treasuryAccount.findUniqueOrThrow({ where: { id } });

    await auditTreasury(
      ctx,
      "treasury_account.updated",
      "TreasuryAccount",
      id,
      { companyId: acc.companyId },
      { after: { name: updatedAccount.name, ...input }, tx },
    );

    return updatedAccount;
  });

  const balance = await getAccountBalance(id);
  return serialize(updated, balance);
}

export async function deactivateTreasuryAccount(id: string, ctx: ServiceContext): Promise<TreasuryAccount> {
  return _setStatus(id, ctx, "INACTIVE", "treasury_account.deactivated");
}

export async function reactivateTreasuryAccount(id: string, ctx: ServiceContext): Promise<TreasuryAccount> {
  return _setStatus(id, ctx, "ACTIVE", "treasury_account.reactivated");
}

/** STATE_MACHINES §23: ACTIVE/INACTIVE → CLOSED only with a zero native balance. */
export async function closeTreasuryAccount(id: string, ctx: ServiceContext): Promise<TreasuryAccount> {
  await assertTreasuryTenantModule(ctx);
  assertCanEditBankAccounts(ctx.roles);

  return prisma.$transaction(async tx => {
    const where = { id, ...treasuryAccountScope(ctx.tenantId) };
    const preview = await tx.treasuryAccount.findFirst({ where, select: { companyId: true } });
    if (!preview) throw new ServiceError("NOT_FOUND", "Cuenta no encontrada");
    if (preview.companyId) await lockCompanyForFinancialWrite(tx, preview.companyId);
    await lockTreasuryAccountRow(tx, id, ctx.tenantId);
    const account = await tx.treasuryAccount.findFirst({ where });
    if (!account || account.companyId !== preview.companyId) {
      throw new ServiceError("CONFLICT", "La cuenta cambió mientras la cerrabas. Recargá e intentá de nuevo.");
    }
    if (account.status === "CLOSED") throw new ServiceError("CONFLICT", "La cuenta ya está cerrada");
    const balance = await getAccountBalance(id, tx);
    if (!balance.isZero()) {
      throw new ServiceError("CONFLICT", "El saldo de la cuenta debe ser cero para cerrarla");
    }
    const closed = await tx.treasuryAccount.update({
      where: { id, tenantId: ctx.tenantId, status: account.status },
      data: { status: "CLOSED", updatedBy: ctx.actorUserId },
    });
    await auditTreasury(ctx, "account.closed", "TreasuryAccount", id, { companyId: closed.companyId }, {
      before: { status: account.status },
      after: { status: "CLOSED", balance: serializeMoneyDecimal(balance), currency: account.currency },
      tx,
    });
    return closed;
  }, { timeout: 30_000 });
}

async function _setStatus(
  id: string,
  ctx: ServiceContext,
  status: "ACTIVE" | "INACTIVE",
  action: string,
): Promise<TreasuryAccount> {
  await assertTreasuryTenantModule(ctx);
  assertCanEditBankAccounts(ctx.roles);
  const acc = await prisma.treasuryAccount.findFirst({ where: { id, ...treasuryAccountScope(ctx.tenantId) } });
  if (!acc) throw new ServiceError("NOT_FOUND", "Cuenta no encontrada");
  if (acc.status === "CLOSED") {
    throw new ServiceError("CONFLICT", "No se puede cambiar el estado de una cuenta cerrada");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.treasuryAccount.updateMany({
      where: { id, tenantId: ctx.tenantId, status: acc.status },
      data: { status, updatedBy: ctx.actorUserId },
    });
    if (result.count !== 1) {
      throw new ServiceError("CONFLICT", "La cuenta cambió de estado. Recargá e intentá de nuevo.");
    }
    const updatedAccount = await tx.treasuryAccount.findUniqueOrThrow({ where: { id } });

    await auditTreasury(
      ctx,
      action,
      "TreasuryAccount",
      id,
      { companyId: acc.companyId },
      { after: { name: acc.name, status }, tx },
    );

    return updatedAccount;
  });

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

function serialize(acc: TreasuryAccount, balance: Prisma.Decimal): TreasuryAccountView {
  return {
    ...acc,
    openingBalance: serializeMoneyDecimal(acc.openingBalance),
    balance: serializeMoneyDecimal(balance),
  };
}
