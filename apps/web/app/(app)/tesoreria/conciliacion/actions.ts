"use server";

import { z } from "zod";
import {
  addBankStatementLine,
  cancelBankReconciliation,
  closeBankReconciliation,
  createBankReconciliation,
  createMovementFromStatementLine,
  importBankStatementLinesFromCsv,
  importBankStatementLinesFromOfx,
  matchBankReconciliationLine,
  removeBankStatementLine,
  reopenBankReconciliation,
  startBankReconciliation,
  unmatchBankReconciliationLine,
  ServiceError,
} from "@bloqer/services";
import {
  addBankStatementLineSchema,
  createBankReconciliationSchema,
  createMovementFromStatementLineSchema,
  importBankStatementCsvSchema,
  importBankStatementOfxSchema,
  matchBankReconciliationSchema,
  reopenBankReconciliationSchema,
  cancelBankReconciliationSchema,
  type AddBankStatementLineInput,
  type CreateBankReconciliationInput,
  type CreateMovementFromStatementLineInput,
  type ImportBankStatementCsvInput,
  type ImportBankStatementOfxInput,
  type MatchBankReconciliationInput,
  type ReopenBankReconciliationInput,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const uuidIdSchema = z.string().uuid("Id inválido");
const lineAndSessionSchema = z.object({
  lineId: z.string().uuid("Id inválido"),
  reconciliationId: z.string().uuid("Id inválido"),
});
const matchAndSessionSchema = z.object({
  matchId: z.string().uuid("Id inválido"),
  reconciliationId: z.string().uuid("Id inválido"),
});

async function getCtx() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  return {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };
}

function handle(err: unknown): { error: string } {
  if (err instanceof ServiceError) return { error: err.message };
  return { error: "Error inesperado" };
}

function revalidateSession(id: string) {
  revalidatePath("/tesoreria/conciliacion");
  revalidatePath(`/tesoreria/conciliacion/${id}`);
}

export async function createBankReconciliationAction(
  data: CreateBankReconciliationInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createBankReconciliationSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const session = await createBankReconciliation(parsed.data, ctx);
    revalidatePath("/tesoreria/conciliacion");
    return { id: session.id };
  } catch (err) {
    return handle(err);
  }
}

export async function startBankReconciliationAction(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const parsed = uuidIdSchema.safeParse(id);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Id inválido" };
  const ctx = await getCtx();
  try {
    await startBankReconciliation(parsed.data, ctx);
    revalidateSession(parsed.data);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function addBankStatementLineAction(
  data: AddBankStatementLineInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = addBankStatementLineSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await addBankStatementLine(parsed.data, ctx);
    revalidateSession(parsed.data.reconciliationId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function importBankStatementCsvAction(
  data: ImportBankStatementCsvInput,
): Promise<
  | { ok: true; importedCount: number; skippedOutOfPeriod: number; skippedDuplicates: number }
  | { error: string }
> {
  const ctx = await getCtx();
  const parsed = importBankStatementCsvSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const result = await importBankStatementLinesFromCsv(parsed.data, ctx);
    revalidateSession(parsed.data.reconciliationId);
    return {
      ok: true,
      importedCount: result.importedCount,
      skippedOutOfPeriod: result.skippedOutOfPeriod,
      skippedDuplicates: result.skippedDuplicates,
    };
  } catch (err) {
    return handle(err);
  }
}

export async function importBankStatementOfxAction(
  data: ImportBankStatementOfxInput,
): Promise<
  | { ok: true; importedCount: number; skippedOutOfPeriod: number; skippedDuplicates: number }
  | { error: string }
> {
  const ctx = await getCtx();
  const parsed = importBankStatementOfxSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const result = await importBankStatementLinesFromOfx(parsed.data, ctx);
    revalidateSession(parsed.data.reconciliationId);
    return {
      ok: true,
      importedCount: result.importedCount,
      skippedOutOfPeriod: result.skippedOutOfPeriod,
      skippedDuplicates: result.skippedDuplicates,
    };
  } catch (err) {
    return handle(err);
  }
}

export async function createMovementFromStatementLineAction(
  data: CreateMovementFromStatementLineInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createMovementFromStatementLineSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await createMovementFromStatementLine(parsed.data, ctx);
    revalidateSession(parsed.data.reconciliationId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function removeBankStatementLineAction(
  lineId: string,
  reconciliationId: string,
): Promise<{ ok: true } | { error: string }> {
  const parsed = lineAndSessionSchema.safeParse({ lineId, reconciliationId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Id inválido" };
  const ctx = await getCtx();
  try {
    await removeBankStatementLine(parsed.data.lineId, ctx);
    revalidateSession(parsed.data.reconciliationId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function matchBankReconciliationLineAction(
  data: MatchBankReconciliationInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = matchBankReconciliationSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await matchBankReconciliationLine(parsed.data, ctx);
    revalidateSession(parsed.data.reconciliationId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function unmatchBankReconciliationLineAction(
  matchId: string,
  reconciliationId: string,
): Promise<{ ok: true } | { error: string }> {
  const parsed = matchAndSessionSchema.safeParse({ matchId, reconciliationId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Id inválido" };
  const ctx = await getCtx();
  try {
    await unmatchBankReconciliationLine(parsed.data.matchId, ctx);
    revalidateSession(parsed.data.reconciliationId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function closeBankReconciliationAction(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const parsed = uuidIdSchema.safeParse(id);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Id inválido" };
  const ctx = await getCtx();
  try {
    await closeBankReconciliation(parsed.data, ctx);
    revalidateSession(parsed.data);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function reopenBankReconciliationAction(
  data: ReopenBankReconciliationInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = reopenBankReconciliationSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await reopenBankReconciliation(parsed.data, ctx);
    revalidateSession(parsed.data.reconciliationId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function cancelBankReconciliationAction(
  id: string,
  reason?: string | null,
): Promise<{ ok: true } | { error: string }> {
  const parsed = cancelBankReconciliationSchema.safeParse({
    reconciliationId: id,
    reason: reason ?? null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const ctx = await getCtx();
  try {
    await cancelBankReconciliation(parsed.data.reconciliationId, ctx, {
      reason: parsed.data.reason,
    });
    revalidateSession(parsed.data.reconciliationId);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
