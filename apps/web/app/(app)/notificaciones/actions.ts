"use server";

import {
  archiveNotification,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  markNotificationAsUnread,
} from "@bloqer/services";
import type { UserRole } from "@bloqer/domain";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

type TenantServiceCtx = {
  actorUserId: string;
  tenantId: string;
  companyId: string | null;
  roles: UserRole[];
};

async function requireServiceCtx(): Promise<TenantServiceCtx> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  return {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };
}

/** For client-invoked actions: never redirect (redirect throws and would be swallowed). */
async function tryServiceCtx(): Promise<TenantServiceCtx | null> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx || !current.session.user.id) return null;
  return {
    actorUserId: current.session.user.id,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };
}

function revalidateNotificationViews() {
  revalidatePath("/notificaciones");
  revalidatePath("/", "layout");
}

export async function markNotificationReadFormAction(formData: FormData): Promise<void> {
  const id = formData.get("notificationId");
  if (typeof id !== "string" || !id) return;
  const ctx = await requireServiceCtx();
  try {
    await markNotificationAsRead(id, ctx);
    revalidateNotificationViews();
  } catch {
    /* NOT_FOUND / FORBIDDEN: no data leak; keep UI stable */
  }
}

/** Client-friendly mark-read used by the header bell dropdown. */
export async function markNotificationReadAction(notificationId: string): Promise<{ ok: boolean }> {
  if (!notificationId?.trim()) return { ok: false };
  const ctx = await tryServiceCtx();
  if (!ctx) return { ok: false };
  try {
    await markNotificationAsRead(notificationId, ctx);
    revalidateNotificationViews();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function markNotificationUnreadFormAction(formData: FormData): Promise<void> {
  const id = formData.get("notificationId");
  if (typeof id !== "string" || !id) return;
  const ctx = await requireServiceCtx();
  try {
    await markNotificationAsUnread(id, ctx);
    revalidateNotificationViews();
  } catch {
    /* NOT_FOUND / FORBIDDEN: no data leak; keep UI stable */
  }
}

export async function archiveNotificationFormAction(formData: FormData): Promise<void> {
  const id = formData.get("notificationId");
  if (typeof id !== "string" || !id) return;
  const ctx = await requireServiceCtx();
  try {
    await archiveNotification(id, ctx);
    revalidateNotificationViews();
  } catch {
    /* NOT_FOUND / FORBIDDEN */
  }
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const ctx = await requireServiceCtx();
  try {
    await markAllNotificationsAsRead(ctx);
    revalidateNotificationViews();
  } catch {
    /* best-effort */
  }
}
