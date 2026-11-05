import { Prisma, prisma, type AccountingAccount } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type {
  CreateAccountingAccountInput,
  UpdateAccountingAccountInput,
} from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertAccountingTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { isCrossCompany } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";
import { lockAccountingCompany, resolveAccountingCompanyId } from "./accounting-company-context";
import { resolvePagination } from "../finance/pagination";

export type AccountingAccountView = AccountingAccount;

async function assertView(ctx: ServiceContext): Promise<void> {
  await assertAccountingTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "ACCOUNTING")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver contabilidad");
  }
}

async function assertEdit(ctx: ServiceContext): Promise<void> {
  await assertAccountingTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "ACCOUNTING")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar contabilidad");
  }
}

export async function listAccountingAccounts(
  ctx: ServiceContext,
  opts?: { companyId?: string | null; page?: number; pageSize?: number },
): Promise<{ data: AccountingAccountView[]; total: number }> {
  await assertView(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, opts?.companyId ?? null);

  const where = { tenantId: ctx.tenantId, companyId };
  const paginate = opts?.page !== undefined || opts?.pageSize !== undefined;
  const { skip, take } = resolvePagination(opts);

  const [data, total] = await Promise.all([
    prisma.accountingAccount.findMany({
      where,
      orderBy: [{ code: "asc" }],
      ...(paginate ? { skip, take } : {}),
    }),
    prisma.accountingAccount.count({ where }),
  ]);

  return { data, total };
}

export async function getAccountingAccountById(
  id: string,
  ctx: ServiceContext,
  opts?: { companyId?: string | null },
): Promise<AccountingAccountView> {
  await assertView(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, opts?.companyId ?? null);
  const acc = await prisma.accountingAccount.findFirst({
    where: { id, tenantId: ctx.tenantId, companyId },
  });
  if (!acc) throw new ServiceError("NOT_FOUND", "Cuenta contable no encontrada");
  return acc;
}

export async function createAccountingAccount(
  input: CreateAccountingAccountInput,
  ctx: ServiceContext,
): Promise<AccountingAccountView> {
  await assertEdit(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);

  const code = input.code.trim();
  const name = input.name.trim();
  if (!code || !name) throw new ServiceError("VALIDATION", "Completá el código y el nombre de la cuenta");

  try {
    return await prisma.$transaction(async (tx) => {
      await lockAccountingCompany(tx, ctx.tenantId, companyId);
      if (input.parentId) {
        const parent = await tx.accountingAccount.findFirst({
          where: { id: input.parentId, tenantId: ctx.tenantId, companyId },
          select: { id: true },
        });
        if (!parent) throw new ServiceError("VALIDATION", "Cuenta superior inválida");
      }
      const created = await tx.accountingAccount.create({
        data: {
          tenantId:    ctx.tenantId,
          companyId,
          code,
          name,
          type:        input.type,
          parentId:    input.parentId ?? null,
          description: input.description?.trim() ?? null,
          isActive:    true,
        },
      });
      await log({
        tenantId:    ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action:      "accounting_account.created",
        entityType:  "AccountingAccount",
        entityId:    created.id,
        after:       { code: created.code, name: created.name, type: created.type },
        ipAddress:   ctx.ipAddress,
      }, tx);
      return created;
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ServiceError("CONFLICT", "Ya existe una cuenta con ese código en la empresa");
    }
    throw e;
  }
}

export async function updateAccountingAccount(
  id: string,
  input: UpdateAccountingAccountInput,
  ctx: ServiceContext,
): Promise<AccountingAccountView> {
  await assertEdit(ctx);
  const existing = await prisma.accountingAccount.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Cuenta contable no encontrada");
  if (isCrossCompany(existing.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "Cuenta fuera del alcance de empresa");
  }
  await resolveAccountingCompanyId(ctx, existing.companyId);

  const companyId = existing.companyId;
  const name = input.name?.trim();
  if (name === "") throw new ServiceError("VALIDATION", "Completá el nombre de la cuenta");
  return prisma.$transaction(async (tx) => {
    await lockAccountingCompany(tx, ctx.tenantId, companyId);
    const fresh = await tx.accountingAccount.findFirst({ where: { id, tenantId: ctx.tenantId, companyId } });
    if (!fresh) throw new ServiceError("NOT_FOUND", "Cuenta contable no encontrada");
    const changesType = input.type !== undefined && input.type !== fresh.type;
    const changesParent = input.parentId !== undefined && input.parentId !== fresh.parentId;
    if (changesType || changesParent) {
      const posted = await tx.journalEntryLine.findFirst({
        where: { accountId: id, journalEntry: { status: "POSTED", tenantId: ctx.tenantId, companyId } },
        select: { id: true },
      });
      if (posted) throw new ServiceError("CONFLICT", "No se puede cambiar el tipo ni la cuenta superior con movimientos contabilizados");
    }

    if (changesParent && input.parentId) {
      const accounts = await tx.accountingAccount.findMany({
        where: { tenantId: ctx.tenantId, companyId },
        select: { id: true, parentId: true },
      });
      const parents = new Map(accounts.map(account => [account.id, account.parentId]));
      const visited = new Set([id]);
      let ancestor: string | null = input.parentId;
      while (ancestor) {
        if (visited.has(ancestor)) throw new ServiceError("VALIDATION", "La jerarquía de cuentas no puede tener ciclos");
        visited.add(ancestor);
        const next = parents.get(ancestor);
        if (next === undefined) throw new ServiceError("VALIDATION", "Cuenta superior inválida");
        ancestor = next;
      }
    }

    const updated = await tx.accountingAccount.update({
      where: { id },
      data: {
        name,
        type: input.type,
        parentId: input.parentId,
        description: input.description === undefined ? undefined : input.description?.trim() ?? null,
        isActive: input.isActive,
      },
    });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "accounting_account.updated",
      entityType: "AccountingAccount",
      entityId: id,
      after: input,
      ipAddress: ctx.ipAddress,
    }, tx);
    return updated;
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function deactivateAccountingAccount(
  id: string,
  ctx: ServiceContext,
): Promise<AccountingAccountView> {
  return updateAccountingAccount(id, { isActive: false }, ctx);
}
