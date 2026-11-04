"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  addScheduleDependency,
  assertScheduleEntityProject,
  cancelScheduleItem,
  copyScheduleProgressFromPhysical,
  createScheduleItem,
  getScheduleItemContext,
  importScheduleFromBudget,
  linkWbsNodesToScheduleItem,
  listScheduleItemAuditHistory,
  listScheduleLinkableWbsOptions,
  moveScheduleItem,
  moveScheduleItemToStatus,
  removeScheduleDependency,
  ServiceError,
  rollupScheduleContainersForProject,
  unlinkWbsNodeFromScheduleItem,
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
  linkWbsNodesSchema,
  moveScheduleItemSchema,
  removeScheduleDependencySchema,
  scheduleItemStatusSchema,
  unlinkWbsNodeSchema,
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
  revalidatePath(`/proyectos/${projectId}/materiales`);
  revalidatePath(`/proyectos/${projectId}/mano-obra`);
  revalidatePath(`/proyectos/${projectId}/equipos`);
  revalidatePath(`/proyectos/${projectId}/control-costos`);
  revalidatePath(`/proyectos/${projectId}/reportes/avances`);
}

function handle(err: unknown): { error: string } {
  if (err instanceof ServiceError) return { error: err.message };
  if (err instanceof ZodError) return { error: "Revisá los datos del formulario." };
  return { error: "Error inesperado" };
}

export async function importScheduleFromBudgetAction(projectId: string, raw: unknown) {
  const ctx = await getCtx();
  try {
    const input = importScheduleFromBudgetSchema.parse(raw);
    await importScheduleFromBudget(projectId, input, ctx);
    revalidateCronograma(projectId);
    return { ok: true as const };
  } catch (e) {
    return handle(e);
  }
}

export async function createScheduleItemAction(projectId: string, raw: unknown) {
  const ctx = await getCtx();
  try {
    const input = createScheduleItemSchema.parse(raw);
    await createScheduleItem(projectId, input, ctx);
    revalidateCronograma(projectId);
    return { ok: true as const };
  } catch (e) {
    return handle(e);
  }
}

export async function moveScheduleItemAction(projectId: string, raw: unknown) {
  const ctx = await getCtx();
  try {
    const input = moveScheduleItemSchema.parse(raw);
    const result = await moveScheduleItem(projectId, input, ctx);
    revalidateCronograma(projectId);
    return {
      ok: true as const,
      promotesLeafToContainer: result.promotesLeafToContainer,
    };
  } catch (e) {
    return handle(e);
  }
}

export async function listScheduleLinkableWbsOptionsAction(projectId: string) {
  const ctx = await getCtx();
  try {
    const options = await listScheduleLinkableWbsOptions(projectId, ctx);
    return { ok: true as const, options };
  } catch (e) {
    return handle(e);
  }
}

export async function linkWbsNodesToScheduleItemAction(
  projectId: string,
  scheduleItemId: string,
  raw: unknown,
) {
  const ctx = await getCtx();
  try {
    const input = linkWbsNodesSchema.parse(raw);
    await assertScheduleEntityProject(projectId, { scheduleItemId }, ctx);
    await linkWbsNodesToScheduleItem(
      scheduleItemId,
      input.wbsNodeIds,
      input.primaryWbsNodeId,
      ctx,
    );
    revalidateCronograma(projectId);
    return { ok: true as const };
  } catch (e) {
    return handle(e);
  }
}

export async function unlinkWbsNodeFromScheduleItemAction(
  projectId: string,
  scheduleItemId: string,
  raw: unknown,
) {
  const ctx = await getCtx();
  try {
    const input = unlinkWbsNodeSchema.parse(raw);
    await assertScheduleEntityProject(projectId, { scheduleItemId }, ctx);
    await unlinkWbsNodeFromScheduleItem(scheduleItemId, input.wbsNodeId, ctx);
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
  try {
    const input = updateScheduleItemDatesSchema.parse(raw);
    await assertScheduleEntityProject(projectId, { scheduleItemId }, ctx);
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
  try {
    const input = updateScheduleItemProgressSchema.parse(raw);
    await assertScheduleEntityProject(projectId, { scheduleItemId }, ctx);
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
  try {
    scheduleItemStatusSchema.parse(status);
    if (status === "BLOCKED") blockScheduleItemSchema.parse({ blockReason });
    await assertScheduleEntityProject(projectId, { scheduleItemId }, ctx);
    const updated = await moveScheduleItemToStatus(scheduleItemId, status, ctx, blockReason);
    revalidateCronograma(projectId);
    return { ok: true as const, status: updated.status };
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
    const input = updateScheduleItemProgressSchema.parse({ progressPct: physicalPct });
    await assertScheduleEntityProject(projectId, { scheduleItemId }, ctx);
    await copyScheduleProgressFromPhysical(scheduleItemId, input.progressPct, ctx);
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
  try {
    const input = updateScheduleItemNameSchema.parse(raw);
    await assertScheduleEntityProject(projectId, { scheduleItemId }, ctx);
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
    await assertScheduleEntityProject(projectId, { scheduleItemId }, ctx);
    await cancelScheduleItem(scheduleItemId, ctx);
    revalidateCronograma(projectId);
    return { ok: true as const };
  } catch (e) {
    return handle(e);
  }
}

export async function listScheduleItemAuditAction(projectId: string, scheduleItemId: string) {
  const ctx = await getCtx();
  try {
    await assertScheduleEntityProject(projectId, { scheduleItemId }, ctx);
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
  try {
    const input = removeScheduleDependencySchema.parse(raw);
    await assertScheduleEntityProject(projectId, { dependencyId: input.dependencyId }, ctx);
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
  try {
    const input = addScheduleDependencySchema.parse(raw);
    await assertScheduleEntityProject(projectId, { scheduleId }, ctx);
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
