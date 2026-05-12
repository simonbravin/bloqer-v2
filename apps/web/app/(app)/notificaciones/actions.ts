"use server";

import {
  archiveNotification,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function serviceCtx() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  return {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };
}

export async function markNotificationReadFormAction(formData: FormData): Promise<void> {
  const id = formData.get("notificationId");
  if (typeof id !== "string" || !id) return;
  try {
    await markNotificationAsRead(id, await serviceCtx());
    revalidatePath("/notificaciones");
  } catch {
    /* NOT_FOUND / FORBIDDEN: no data leak; keep UI stable */
  }
}

export async function archiveNotificationFormAction(formData: FormData): Promise<void> {
  const id = formData.get("notificationId");
  if (typeof id !== "string" || !id) return;
  try {
    await archiveNotification(id, await serviceCtx());
    revalidatePath("/notificaciones");
  } catch {
    /* NOT_FOUND / FORBIDDEN */
  }
}

export async function markAllNotificationsReadAction(): Promise<void> {
  try {
    await markAllNotificationsAsRead(await serviceCtx());
    revalidatePath("/notificaciones");
  } catch {
    /* best-effort */
  }
}
