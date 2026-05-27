import { Prisma, prisma, TreasuryAccount } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateTreasuryAccountInput, UpdateTreasuryAccountInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { getAccountBalance, AccountBalanceSummary } from "./balance.service";

export type TreasuryAccountView = Omit<TreasuryAccount, "openingBalance"> & {
  openingBalance: string;
  balance: string;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getTreasuryAccountById(
  id: string,
  ctx: ServiceContext,
): Promise<TreasuryAccountView> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas de tesorería");
  }
  const acc = await prisma.treasuryAccount.findUnique({ where: { id } });
  if (!acc) throw new ServiceError("NOT_FOUND", "Cuenta no encontrada");
  if (acc.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  const balance = await getAccountBalance(id);
  return serialize(acc, balance);
}

export async function listTreasuryAccounts(
  ctx: ServiceContext,
  opts?: { page?: number; pageSize?: number },
): Promise<{ data: TreasuryAccountView[]; total: number }> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas de tesorería");
  }

  const where = { tenantId: ctx.tenantId };
  const paginate = opts?.page !== undefined || opts?.pageSize !== undefined;
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;

  const [accounts, total] = await Promise.all([
    prisma.treasuryAccount.findMany({
      where,
      orderBy: { name: "asc" },
      ...(paginate ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
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

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createTreasuryAccount(
  input: CreateTreasuryAccountInput,
  ctx: ServiceContext,
): Promise<TreasuryAccountView> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear cuentas");
  }

  const openingBalance = new Prisma.Decimal(input.openingBalance ?? "0");
  const companyId = input.companyId ?? ctx.companyId ?? null;

  const acc = await prisma.$transaction(async (tx) => {
    const created = await tx.treasuryAccount.create({
      data: {
        tenantId: ctx.tenantId,
        companyId,
        name: input.name,
        type: input.type,
        currency: input.currency ?? "ARS",
        bankName: input.bankName ?? null,
        accountNumber: input.accountNumber ?? null,
        alias: input.alias ?? null,
        notes: input.notes ?? null,
        openingBalance,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    // D6: create OPENING_BALANCE movement if openingBalance > 0
    if (openingBalance.greaterThan(0)) {
      await tx.accountMovement.create({
        data: {
          tenantId: ctx.tenantId,
          companyId,
          accountId: created.id,
          movementDate: new Date(),
          type: "INFLOW",
          sourceType: "OPENING_BALANCE",
          sourceId: created.id,
          currency: created.currency,
          amount: openingBalance,
          description: "Saldo inicial",
          status: "CONFIRMED",
          createdBy: ctx.actorUserId,
        },
      });
    }

    return created;
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "treasury_account.created",
    entityType: "TreasuryAccount",
    entityId: acc.id,
    after: { name: input.name, type: input.type, currency: input.currency },
    ipAddress: ctx.ipAddress,
  });

  const balance = await getAccountBalance(acc.id);
  return serialize(acc, balance);
}

export async function updateTreasuryAccount(
  id: string,
  input: UpdateTreasuryAccountInput,
  ctx: ServiceContext,
): Promise<TreasuryAccountView> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar cuentas");
  }
  const acc = await prisma.treasuryAccount.findUnique({ where: { id } });
  if (!acc) throw new ServiceError("NOT_FOUND", "Cuenta no encontrada");
  if (acc.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (acc.status === "CLOSED") throw new ServiceError("CONFLICT", "No se puede editar una cuenta cerrada");

  const updated = await prisma.treasuryAccount.update({
    where: { id },
    data: {
      name:          input.name          ?? undefined,
      bankName:      input.bankName      ?? undefined,
      accountNumber: input.accountNumber ?? undefined,
      alias:         input.alias         ?? undefined,
      notes:         input.notes         ?? undefined,
      updatedBy: ctx.actorUserId,
    },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "treasury_account.updated",
    entityType: "TreasuryAccount",
    entityId: id,
    after: input,
    ipAddress: ctx.ipAddress,
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

async function _setStatus(
  id: string,
  ctx: ServiceContext,
  status: "ACTIVE" | "INACTIVE",
  action: string,
): Promise<TreasuryAccount> {
  await assertTreasuryTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "TREASURY")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para modificar cuentas");
  }
  const acc = await prisma.treasuryAccount.findUnique({ where: { id } });
  if (!acc) throw new ServiceError("NOT_FOUND", "Cuenta no encontrada");
  if (acc.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const updated = await prisma.treasuryAccount.update({
    where: { id },
    data: { status, updatedBy: ctx.actorUserId },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action,
    entityType: "TreasuryAccount",
    entityId: id,
    after: { status },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

// ─── Serialization ────────────────────────────────────────────────────────────

function serialize(acc: TreasuryAccount, balance: Prisma.Decimal): TreasuryAccountView {
  return {
    ...acc,
    openingBalance: acc.openingBalance.toString(),
    balance: balance.toString(),
  };
}
