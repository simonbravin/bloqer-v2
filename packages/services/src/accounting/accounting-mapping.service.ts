import { Prisma, prisma } from "@bloqer/database";
import type { AccountingMappingEventType, AccountingMappingRule } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type {
  CreateAccountingMappingRuleInput,
  UpdateAccountingMappingRuleInput,
} from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { assertAccountingTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { isCrossCompany } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";
import { resolveAccountingCompanyId } from "./accounting-company-context";

/** Ensures tenant-wide users cannot mutate a rule while scoped to another company (`?empresa=` / payload). */
async function assertRuleMutationCompany(
  ctx: ServiceContext,
  ruleCompanyId: string,
  scopeCompanyIdInput: string | null | undefined,
): Promise<void> {
  let resolved: string;
  if (scopeCompanyIdInput) {
    resolved = await resolveAccountingCompanyId(ctx, scopeCompanyIdInput);
  } else if (ctx.companyId) {
    resolved = await resolveAccountingCompanyId(ctx, ctx.companyId);
  } else {
    resolved = await resolveAccountingCompanyId(ctx, ruleCompanyId);
  }
  if (resolved !== ruleCompanyId) {
    throw new ServiceError("FORBIDDEN", "La regla no corresponde a la empresa del contexto");
  }
}

export type AccountingMappingRuleView = AccountingMappingRule & {
  debitAccountCode:  string;
  creditAccountCode: string;
};

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

export async function findActiveMappingRule(
  tenantId: string,
  companyId: string,
  eventType: AccountingMappingEventType,
): Promise<AccountingMappingRule | null> {
  return prisma.accountingMappingRule.findFirst({
    where: { tenantId, companyId, eventType, isActive: true },
    orderBy: [{ priority: "asc" }, { id: "asc" }],
  });
}

function serializeRule(
  r: AccountingMappingRule & { debitAccount: { code: string }; creditAccount: { code: string } },
): AccountingMappingRuleView {
  return {
    ...r,
    debitAccountCode:  r.debitAccount.code,
    creditAccountCode: r.creditAccount.code,
  };
}

export async function listAccountingMappingRules(
  ctx: ServiceContext,
  opts?: { companyId?: string | null },
): Promise<AccountingMappingRuleView[]> {
  await assertView(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, opts?.companyId ?? null);
  const rows = await prisma.accountingMappingRule.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    orderBy: [{ eventType: "asc" }, { priority: "asc" }, { name: "asc" }],
    include: { debitAccount: true, creditAccount: true },
  });
  return rows.map(serializeRule);
}

export async function getAccountingMappingRuleById(
  id: string,
  ctx: ServiceContext,
  opts?: { companyId?: string | null },
): Promise<AccountingMappingRuleView> {
  await assertView(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, opts?.companyId ?? null);
  const r = await prisma.accountingMappingRule.findFirst({
    where: { id, tenantId: ctx.tenantId, companyId },
    include: { debitAccount: true, creditAccount: true },
  });
  if (!r) throw new ServiceError("NOT_FOUND", "Regla no encontrada");
  return serializeRule(r);
}

async function validateDebitCreditAccounts(
  tenantId: string,
  companyId: string,
  debitAccountId: string,
  creditAccountId: string,
): Promise<void> {
  if (debitAccountId === creditAccountId) {
    throw new ServiceError("VALIDATION", "La cuenta del debe y del haber deben ser distintas");
  }
  const accounts = await prisma.accountingAccount.findMany({
    where: {
      id: { in: [debitAccountId, creditAccountId] },
      tenantId,
      companyId,
      isActive: true,
    },
  });
  if (accounts.length !== 2) {
    throw new ServiceError("VALIDATION", "Las cuentas contables deben existir, estar activas y pertenecer a la empresa");
  }
}

export async function createAccountingMappingRule(
  input: CreateAccountingMappingRuleInput,
  ctx: ServiceContext,
): Promise<AccountingMappingRuleView> {
  await assertEdit(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);
  await validateDebitCreditAccounts(ctx.tenantId, companyId, input.debitAccountId, input.creditAccountId);

  const created = await prisma.accountingMappingRule.create({
    data: {
      tenantId:        ctx.tenantId,
      companyId,
      eventType:       input.eventType,
      name:            input.name.trim(),
      description:     input.description?.trim() ?? null,
      debitAccountId:  input.debitAccountId,
      creditAccountId: input.creditAccountId,
      priority:        input.priority ?? 100,
      isActive:        true,
      metadata:
        input.metadata === undefined || input.metadata === null
          ? undefined
          : (input.metadata as Prisma.InputJsonValue),
    },
    include: { debitAccount: true, creditAccount: true },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "accounting_mapping_rule.created",
    entityType:  "AccountingMappingRule",
    entityId:    created.id,
    after:       { eventType: created.eventType, name: created.name },
    ipAddress:   ctx.ipAddress,
  });

  return serializeRule(created);
}

export async function updateAccountingMappingRule(
  id: string,
  input: UpdateAccountingMappingRuleInput,
  ctx: ServiceContext,
): Promise<AccountingMappingRuleView> {
  await assertEdit(ctx);
  const existing = await prisma.accountingMappingRule.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Regla no encontrada");
  if (isCrossCompany(existing.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "Regla fuera del alcance de empresa");
  }
  await assertRuleMutationCompany(ctx, existing.companyId, input.companyId ?? null);
  await resolveAccountingCompanyId(ctx, existing.companyId);

  const debitId = input.debitAccountId ?? existing.debitAccountId;
  const creditId = input.creditAccountId ?? existing.creditAccountId;
  await validateDebitCreditAccounts(ctx.tenantId, existing.companyId, debitId, creditId);

  const updated = await prisma.accountingMappingRule.update({
    where: { id },
    data: {
      eventType:       input.eventType ?? undefined,
      name:            input.name?.trim() ?? undefined,
      description:     input.description === undefined ? undefined : input.description?.trim() ?? null,
      debitAccountId:  input.debitAccountId ?? undefined,
      creditAccountId: input.creditAccountId ?? undefined,
      priority:        input.priority ?? undefined,
      isActive:        input.isActive ?? undefined,
      metadata:
        input.metadata === undefined
          ? undefined
          : input.metadata === null
            ? Prisma.JsonNull
            : (input.metadata as Prisma.InputJsonValue),
    },
    include: { debitAccount: true, creditAccount: true },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "accounting_mapping_rule.updated",
    entityType:  "AccountingMappingRule",
    entityId:    id,
    after: {
      name:            input.name,
      eventType:       input.eventType,
      description:     input.description,
      debitAccountId:  input.debitAccountId,
      creditAccountId: input.creditAccountId,
      priority:        input.priority,
      isActive:        input.isActive,
    },
    ipAddress:   ctx.ipAddress,
  });

  return serializeRule(updated);
}

export async function deactivateAccountingMappingRule(
  id: string,
  ctx: ServiceContext,
  opts?: { scopeCompanyId?: string | null },
): Promise<AccountingMappingRuleView> {
  return updateAccountingMappingRule(
    id,
    { isActive: false, companyId: opts?.scopeCompanyId ?? undefined },
    ctx,
  );
}
