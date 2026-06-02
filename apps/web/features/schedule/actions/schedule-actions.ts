"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addScheduleDependency,
  blockScheduleItem,
  cancelScheduleItem,
  copyScheduleProgressFromPhysical,
  createScheduleItem,
  getScheduleItemContext,
  importScheduleFromBudget,
  linkWbsNodesToScheduleItem,
  listScheduleItemAuditHistory,
  moveScheduleItemToStatus,
  removeScheduleDependency,
  ServiceError,
  rollupScheduleContainersForProject,
  updateScheduleItemDates,
  updateScheduleItemName,
  updateScheduleItemProgress,
} from "@bloqer/services";
import type { ScheduleItemStatus } from "@bloqer/database";
import {
  addScheduleDependencySchema,
  blockScheduleItemSchema,
  createScheduleItemSchema,
  importScheduleFromBudgetSchema,
  removeScheduleDependencySchema,
  updateScheduleItemDatesSchema,
  updateScheduleItemNameSchema,
  updateScheduleItemProgressSchema,
} from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";

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

function revalidateCronograma(projectId: string) {
  revalidatePath(`/proyectos/${projectId}/cronograma`);
  revalidatePath(`/proyectos/${projectId}`);
}

function handle(err: unknown): { error: string } {
  if (err instanceof ServiceError) return { error: err.message };
  return { error: "Error inesperado" };
}

export async function importScheduleFromBudgetAction(projectId: string, raw: unknown) {
  const ctx = await getCtx();
  const input = importScheduleFromBudgetSchema.parse(raw);
  try {
    await importScheduleFromBudget(projectId, input, ctx);
    revalidateCronograma(projectId);
    return { ok: true as const };
  } catch (e) {
    return handle(e);
  }
}

export async function createScheduleItemAction(projectId: string, raw: unknown) {
  const ctx = await getCtx();
  const input = createScheduleItemSchema.parse(raw);
  try {
    await createScheduleItem(projectId, input, ctx);
    revalidateCronograma(projectId);
    return { ok: true as const };
  } catch (e) {
    return handle(e);
  }
}

export async function updateScheduleItemDatesAction(
  projectId: string,
  scheduleItemId: string,
  raw: unknown,
) {
  const ctx = await getCtx();
  const input = updateScheduleItemDatesSchema.parse(raw);
  try {
    const { fsWarnings } = await updateScheduleItemDates(scheduleItemId, input, ctx);
    revalidateCronograma(projectId);
    return { ok: true as const, fsWarnings };
  } catch (e) {
    return handle(e);
  }
}

export async function rollupScheduleContainersAction(projectId: string) {
  const ctx = await getCtx();
  try {
    await rollupScheduleContainersForProject(projectId, ctx);
    revalidateCronograma(projectId);
    return { ok: true as const };
  } catch (e) {
    return handle(e);
  }
}

export async function updateScheduleItemProgressAction(
  projectId: string,
  scheduleItemId: string,
  raw: unknown,
) {
  const ctx = await getCtx();
  const input = updateScheduleItemProgressSchema.parse(raw);
  try {
    await updateScheduleItemProgress(scheduleItemId, input.progressPct, ctx);
    revalidateCronograma(projectId);
    return { ok: true as const };
  } catch (e) {
    return handle(e);
  }
}

export async function moveScheduleItemStatusAction(
  projectId: string,
  scheduleItemId: string,
  status: ScheduleItemStatus,
  blockReason?: string,
) {
  const ctx = await getCtx();
  if (status === "BLOCKED") blockScheduleItemSchema.parse({ blockReason });
  try {
    await moveScheduleItemToStatus(scheduleItemId, status, ctx, blockReason);
    revalidateCronograma(projectId);
    return { ok: true as const };
  } catch (e) {
    return handle(e);
  }
}

export async function copyProgressFromPhysicalAction(
  projectId: string,
  scheduleItemId: string,
  physicalPct: number,
) {
  const ctx = await getCtx();
  try {
    await copyScheduleProgressFromPhysical(scheduleItemId, physicalPct, ctx);
    revalidateCronograma(projectId);
    return { ok: true as const };
  } catch (e) {
    return handle(e);
  }
}

export async function updateScheduleItemNameAction(
  projectId: string,
  scheduleItemId: string,
  raw: unknown,
) {
  const ctx = await getCtx();
  const input = updateScheduleItemNameSchema.parse(raw);
  try {
    await updateScheduleItemName(scheduleItemId, input.name, ctx);
    revalidateCronograma(projectId);
    return { ok: true as const };
  } catch (e) {
    return handle(e);
  }
}

export async function cancelScheduleItemAction(projectId: string, scheduleItemId: string) {
  const ctx = await getCtx();
  try {
    await cancelScheduleItem(scheduleItemId, ctx);
    revalidateCronograma(projectId);
    return { ok: true as const };
  } catch (e) {
    return handle(e);
  }
}

export async function listScheduleItemAuditAction(scheduleItemId: string) {
  const ctx = await getCtx();
  try {
    const entries = await listScheduleItemAuditHistory(scheduleItemId, ctx);
    return {
      ok: true as const,
      entries: entries.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  } catch (e) {
    return handle(e);
  }
}

export async function getScheduleItemContextAction(projectId: string, scheduleItemId: string) {
  const ctx = await getCtx();
  try {
    const context = await getScheduleItemContext(projectId, scheduleItemId, ctx);
    return { ok: true as const, context };
  } catch (e) {
    return handle(e);
  }
}

export async function removeScheduleDependencyAction(
  projectId: string,
  raw: unknown,
) {
  const ctx = await getCtx();
  const input = removeScheduleDependencySchema.parse(raw);
  try {
    await removeScheduleDependency(input.dependencyId, ctx);
    revalidateCronograma(projectId);
    return { ok: true as const };
  } catch (e) {
    return handle(e);
  }
}

export async function addScheduleDependencyAction(
  projectId: string,
  scheduleId: string,
  raw: unknown,
) {
  const ctx = await getCtx();
  const input = addScheduleDependencySchema.parse(raw);
  try {
    await addScheduleDependency(
      scheduleId,
      input.predecessorId,
      input.successorId,
      ctx,
    );
    revalidateCronograma(projectId);
    return { ok: true as const };
  } catch (e) {
    return handle(e);
  }
}
