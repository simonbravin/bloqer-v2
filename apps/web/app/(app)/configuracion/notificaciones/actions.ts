"use server";

import {
  ServiceError,
  resetMyNotificationEmailPreference,
  upsertMyNotificationEmailPreference,
} from "@bloqer/services";
import {
  upsertNotificationEmailPreferenceSchema,
  type UpsertNotificationEmailPreferenceInput,
} from "@bloqer/validators";
import { z } from "zod";
import { NOTIFICATION_EMAIL_CATEGORIES } from "@bloqer/domain";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function getCtx() {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  return ctx;
}

const resetSchema = z.object({
  category: z.enum(
    NOTIFICATION_EMAIL_CATEGORIES as unknown as [
      (typeof NOTIFICATION_EMAIL_CATEGORIES)[number],
      ...(typeof NOTIFICATION_EMAIL_CATEGORIES)[number][],
    ],
  ),
});

export async function upsertMyNotificationEmailPreferenceAction(
  data: UpsertNotificationEmailPreferenceInput,
): Promise<
  | { ok: true; preference: Awaited<ReturnType<typeof upsertMyNotificationEmailPreference>> }
  | { error: string }
> {
  const ctx = await getCtx();
  const parsed = upsertNotificationEmailPreferenceSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  try {
    const preference = await upsertMyNotificationEmailPreference(
      parsed.data.category,
      parsed.data.emailEnabled,
      ctx,
    );
    revalidatePath("/configuracion/notificaciones");
    return { ok: true, preference };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}

export async function resetMyNotificationEmailPreferenceAction(
  data: { category: (typeof NOTIFICATION_EMAIL_CATEGORIES)[number] },
): Promise<
  | { ok: true; preference: Awaited<ReturnType<typeof resetMyNotificationEmailPreference>> }
  | { error: string }
> {
  const ctx = await getCtx();
  const parsed = resetSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  try {
    const preference = await resetMyNotificationEmailPreference(parsed.data.category, ctx);
    revalidatePath("/configuracion/notificaciones");
    return { ok: true, preference };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}
