"use server";

import {
  cancelJournalEntry,
  createAccountingAccount,
  createAccountingMappingRule,
  createJournalEntry,
  deactivateAccountingMappingRule,
  postJournalEntry,
  ServiceError,
  updateAccountingMappingRule,
  updateJournalEntry,
} from "@bloqer/services";
import {
  cancelJournalEntrySchema,
  createAccountingAccountSchema,
  createAccountingMappingRuleSchema,
  createJournalEntrySchema,
  postJournalEntrySchema,
  updateAccountingMappingRuleSchema,
  updateJournalEntrySchema,
  type CreateAccountingAccountInput,
  type CreateAccountingMappingRuleInput,
  type CreateJournalEntryInput,
  type UpdateAccountingMappingRuleInput,
  type UpdateJournalEntryInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function getCtx() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const h = await headers();
  return {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
    ipAddress:   h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  };
}

function handle(err: unknown): { error: string } {
  if (err instanceof ServiceError) return { error: err.message };
  return { error: "Error inesperado" };
}

export async function createAccountingAccountAction(
  data: CreateAccountingAccountInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createAccountingAccountSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const acc = await createAccountingAccount(parsed.data, ctx);
    revalidatePath("/contabilidad");
    revalidatePath("/contabilidad/cuentas");
    return { id: acc.id };
  } catch (err) {
    return handle(err);
  }
}

export async function createJournalEntryAction(
  data: CreateJournalEntryInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createJournalEntrySchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const entry = await createJournalEntry(parsed.data, ctx);
    revalidatePath("/contabilidad");
    revalidatePath("/contabilidad/asientos");
    return { id: entry.id };
  } catch (err) {
    return handle(err);
  }
}

export async function updateJournalEntryAction(
  id: string,
  data: UpdateJournalEntryInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = updateJournalEntrySchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateJournalEntry(id, parsed.data, ctx);
    revalidatePath("/contabilidad/asientos");
    revalidatePath(`/contabilidad/asientos/${id}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function postJournalEntryAction(
  data: unknown,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = postJournalEntrySchema.safeParse(data);
  if (!parsed.success) return { error: "Datos inválidos" };
  try {
    await postJournalEntry(parsed.data.id, ctx);
    revalidatePath("/contabilidad/asientos");
    revalidatePath(`/contabilidad/asientos/${parsed.data.id}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelJournalEntryAction(
  data: unknown,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = cancelJournalEntrySchema.safeParse(data);
  if (!parsed.success) return { error: "Datos inválidos" };
  try {
    await cancelJournalEntry(parsed.data.id, ctx);
    revalidatePath("/contabilidad/asientos");
    revalidatePath(`/contabilidad/asientos/${parsed.data.id}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function createAccountingMappingRuleAction(
  data: CreateAccountingMappingRuleInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createAccountingMappingRuleSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const rule = await createAccountingMappingRule(parsed.data, ctx);
    revalidatePath("/contabilidad/reglas");
    revalidatePath(`/contabilidad/reglas/${rule.id}`);
    return { id: rule.id };
  } catch (err) {
    return handle(err);
  }
}

export async function updateAccountingMappingRuleAction(
  ruleId: string,
  data: UpdateAccountingMappingRuleInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = updateAccountingMappingRuleSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateAccountingMappingRule(ruleId, parsed.data, ctx);
    revalidatePath("/contabilidad/reglas");
    revalidatePath(`/contabilidad/reglas/${ruleId}`);
    revalidatePath(`/contabilidad/reglas/${ruleId}/editar`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function deactivateAccountingMappingRuleAction(
  ruleId: string,
  scopeCompanyId?: string | null,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await deactivateAccountingMappingRule(ruleId, ctx, { scopeCompanyId: scopeCompanyId ?? undefined });
    revalidatePath("/contabilidad/reglas");
    revalidatePath(`/contabilidad/reglas/${ruleId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
