"use server";

import { sendReportByEmail, ServiceError, type SendReportByEmailResult } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";

export type SendReportEmailActionResult =
  | { success: true; data: SendReportByEmailResult }
  | { success: false; error: string; code?: string };

/** Phase 9C — manual report email; tenant from session only. */
export async function sendReportEmailAction(input: unknown): Promise<SendReportEmailActionResult> {
  const u = await getCurrentUser();
  if (!u?.tenantCtx || !u.session.user?.id) {
    return { success: false, error: "No autorizado" };
  }
  const ctx = {
    actorUserId: u.session.user.id,
    tenantId: u.tenantCtx.tenantId,
    companyId: u.tenantCtx.companyId,
    roles: u.tenantCtx.roles,
  };
  try {
    const data = await sendReportByEmail(input, ctx);
    return { success: true, data };
  } catch (e) {
    if (e instanceof ServiceError) {
      return { success: false, error: e.message, code: e.code };
    }
    return { success: false, error: "No se pudo enviar el reporte" };
  }
}
