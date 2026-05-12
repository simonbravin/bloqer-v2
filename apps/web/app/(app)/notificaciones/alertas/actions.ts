"use server";

import {
  canRunOperationalAlerts,
  isOperationalAlertType,
  runAllOperationalAlerts,
  runOperationalAlert,
  ServiceError,
  type OperationalAlertRunResult,
  type RunAllOperationalAlertsResult,
} from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type OperationalAlertsActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; kind: "single"; result: OperationalAlertRunResult }
  | { status: "success"; kind: "all"; result: RunAllOperationalAlertsResult };

async function buildServiceContext() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx || !current.session.user?.id) return null;
  return {
    actorUserId: current.session.user.id,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };
}

export async function runOperationalAlertsDispatchAction(
  _prev: OperationalAlertsActionState,
  formData: FormData,
): Promise<OperationalAlertsActionState> {
  const ctx = await buildServiceContext();
  if (!ctx) return { status: "error", message: "Sesión o tenant no disponible" };

  if (!canRunOperationalAlerts(ctx)) {
    return { status: "error", message: "Acceso denegado" };
  }

  const intent = formData.get("intent");
  try {
    if (intent === "all") {
      const result = await runAllOperationalAlerts(ctx);
      revalidatePath("/notificaciones");
      revalidatePath("/notificaciones/alertas");
      return { status: "success", kind: "all", result };
    }
    if (intent === "single") {
      const raw = formData.get("alertType");
      if (typeof raw !== "string" || !isOperationalAlertType(raw)) {
        return { status: "error", message: "Tipo de alerta inválido" };
      }
      const result = await runOperationalAlert(raw, ctx);
      revalidatePath("/notificaciones");
      revalidatePath("/notificaciones/alertas");
      return { status: "success", kind: "single", result };
    }
    return { status: "error", message: "Solicitud inválida" };
  } catch (e) {
    if (e instanceof ServiceError) return { status: "error", message: e.message };
    return { status: "error", message: "No se pudo completar la operación" };
  }
}
