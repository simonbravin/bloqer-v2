import type { DashboardKpi } from "../dashboard/tenant-dashboard.service";
import type { ServiceContext } from "../types";
import {
  buildFinanceCorporateKpis,
  buildFinanceProjection,
  resolveFinanceCorporateAccess,
  type FinanceCorporateAlert,
  type FinanceProjectionSummary,
} from "./finance-corporate-kpis.service";

export type TransaccionesAlert = FinanceCorporateAlert;

export type TransaccionesProjectionSummary = FinanceProjectionSummary;

export type TransaccionesOverview = {
  visible: boolean;
  kpis: DashboardKpi[];
  alerts: TransaccionesAlert[];
  projection: TransaccionesProjectionSummary | null;
};

/** KPIs, alertas y proyección corporativa para `/finanzas/transacciones` (reutiliza servicios existentes). */
export async function getTransaccionesOverview(ctx: ServiceContext): Promise<TransaccionesOverview> {
  const access = await resolveFinanceCorporateAccess(ctx);

  if (!access.canTreasury && !access.canAp) {
    return { visible: false, kpis: [], alerts: [], projection: null };
  }

  const { kpis, alerts, corporatePayables } = await buildFinanceCorporateKpis(ctx, access);
  const projection = await buildFinanceProjection(ctx, access, corporatePayables, alerts);

  return { visible: true, kpis, alerts, projection };
}
