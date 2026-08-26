"use server";

import {
  getWbsItemCostDetail,
  ServiceError,
  type CostControlFilters,
  type WbsItemCostDetail,
} from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";

export async function getWbsItemCostDetailAction(
  wbsNodeId: string,
  projectId: string,
  filters: Pick<CostControlFilters, "budgetId" | "dateFrom" | "dateTo">,
): Promise<{ ok: true; detail: WbsItemCostDetail } | { error: string }> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) {
    return { error: "Sesión expirada. Volvé a iniciar sesión." };
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    const detail = await getWbsItemCostDetail(wbsNodeId, projectId, filters, ctx);
    return { ok: true, detail };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "No se pudo cargar el detalle de la partida" };
  }
}
