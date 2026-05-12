import { Prisma, prisma, type AccountingAccount } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type {
  CreateAccountingAccountInput,
  UpdateAccountingAccountInput,
} from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertAccountingTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { resolveAccountingCompanyId } from "./accounting-company-context";

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
  opts?: { companyId?: string | null },
): Promise<AccountingAccountView[]> {
  await assertView(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, opts?.companyId ?? null);
  return prisma.accountingAccount.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    orderBy: [{ code: "asc" }],
  });
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

  if (input.parentId) {
    const parent = await prisma.accountingAccount.findUnique({ where: { id: input.parentId } });
    if (!parent || parent.tenantId !== ctx.tenantId || parent.companyId !== companyId) {
      throw new ServiceError("VALIDATION", "Cuenta superior inválida");
    }
  }

  try {
    const created = await prisma.accountingAccount.create({
      data: {
        tenantId:    ctx.tenantId,
        companyId,
        code:        input.code.trim(),
        name:        input.name.trim(),
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
    });

    return created;
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
  const existing = await prisma.accountingAccount.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Cuenta contable no encontrada");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Acceso denegado");
  if (ctx.companyId && existing.companyId !== ctx.companyId) {
    throw new ServiceError("FORBIDDEN", "Cuenta fuera del alcance de empresa");
  }
  await resolveAccountingCompanyId(ctx, existing.companyId);

  const postedLineCount = await prisma.journalEntryLine.count({
    where: {
      accountId: id,
      journalEntry: { status: "POSTED", tenantId: ctx.tenantId },
    },
  });
  if (postedLineCount > 0) {
    if (input.type !== undefined && input.type !== existing.type) {
      throw new ServiceError(
        "CONFLICT",
        "No se puede cambiar el tipo de cuenta con movimientos contabilizados",
      );
    }
    if (
      input.parentId !== undefined
      && (input.parentId ?? null) !== (existing.parentId ?? null)
    ) {
      throw new ServiceError(
        "CONFLICT",
        "No se puede cambiar la cuenta superior con movimientos contabilizados",
      );
    }
  }

  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) {
      throw new ServiceError("VALIDATION", "La cuenta no puede ser su propia superior");
    }
    const parent = await prisma.accountingAccount.findUnique({ where: { id: input.parentId } });
    if (!parent || parent.tenantId !== ctx.tenantId || parent.companyId !== existing.companyId) {
      throw new ServiceError("VALIDATION", "Cuenta superior inválida");
    }
  }

  const updated = await prisma.accountingAccount.update({
    where: { id },
    data: {
      name:        input.name?.trim() ?? undefined,
      type:        input.type ?? undefined,
      parentId:    input.parentId === undefined ? undefined : input.parentId,
      description: input.description === undefined ? undefined : input.description?.trim() ?? null,
      isActive:    input.isActive ?? undefined,
    },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "accounting_account.updated",
    entityType:  "AccountingAccount",
    entityId:    id,
    after:       input,
    ipAddress:   ctx.ipAddress,
  });

  return updated;
}

export async function deactivateAccountingAccount(
  id: string,
  ctx: ServiceContext,
): Promise<AccountingAccountView> {
  return updateAccountingAccount(id, { isActive: false }, ctx);
}
