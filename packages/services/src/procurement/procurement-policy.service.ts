import { Prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CompanyProcurementSettingsView } from "./company-procurement-settings.service";
import { canBypassDirectPoPolicy } from "./procurement-access";
import { ServiceError } from "../types";
import type { ServiceContext } from "../types";

export function assertDirectPoAllowed(
  settings: CompanyProcurementSettingsView,
  totalAmountArs: Prisma.Decimal,
  ctx: ServiceContext,
  options?: { emergencyReason?: string | null },
): void {
  if (canBypassDirectPoPolicy(ctx.roles) && settings.allowDirectPo) {
    return;
  }

  if (!settings.allowDirectPo) {
    throw new ServiceError(
      "CONFLICT",
      "La política de la empresa exige solicitud de compra previa. No se permite OC directa.",
    );
  }

  const requiredAbove = settings.purchaseRequestRequiredAboveArs
    ? new Prisma.Decimal(settings.purchaseRequestRequiredAboveArs)
    : null;

  if (requiredAbove && totalAmountArs.greaterThanOrEqualTo(requiredAbove)) {
    if (settings.allowEmergencyDirectPo && options?.emergencyReason?.trim()) {
      if (!ctx.roles.some((r) => r === "OWNER" || r === "ADMIN")) {
        throw new ServiceError("FORBIDDEN", "Solo administración puede autorizar compra de emergencia sin solicitud");
      }
      return;
    }
    throw new ServiceError(
      "CONFLICT",
      `Compras desde ${settings.purchaseRequestRequiredAboveArs} ARS requieren solicitud de compra con cotizaciones.`,
    );
  }
}

export function assertProjectApDirectSpendAllowed(
  settings: CompanyProcurementSettingsView,
  estimatedAmountArs: Prisma.Decimal,
  ctx: ServiceContext,
): void {
  if (!settings.purchaseRequestRequiredAboveArs) return;

  const requiredAbove = new Prisma.Decimal(settings.purchaseRequestRequiredAboveArs);
  if (estimatedAmountArs.lessThan(requiredAbove)) return;

  if (can(ctx.roles, "APPROVE", "AP") || ctx.roles.some((r) => r === "OWNER" || r === "ADMIN")) {
    return;
  }

  throw new ServiceError(
    "CONFLICT",
    "Factura directa a obra sobre el umbral configurado requiere OC o solicitud de compra completada.",
  );
}

export function assertSelfApprovalAllowed(
  settings: CompanyProcurementSettingsView,
  originRequestedByUserId: string | null | undefined,
  actorUserId: string | undefined,
  requiresExtraVarianceApproval: boolean,
  requiresHighLevelAmountApproval: boolean,
): void {
  if (!actorUserId || !originRequestedByUserId || originRequestedByUserId !== actorUserId) {
    return;
  }
  if (settings.allowSelfApproval && !requiresExtraVarianceApproval && !requiresHighLevelAmountApproval) {
    return;
  }
  throw new ServiceError("FORBIDDEN", "No podés aprobar una orden que originaste vos mismo");
}

export function assertHighLevelApprover(
  roles: ServiceContext["roles"],
  requiresHighLevelAmountApproval: boolean,
  requiresExtraVarianceApproval: boolean,
): void {
  if (!requiresHighLevelAmountApproval && !requiresExtraVarianceApproval) return;
  if (roles.some((r) => r === "OWNER" || r === "ADMIN")) return;
  throw new ServiceError("FORBIDDEN", "Esta orden requiere aprobación de administración");
}

export function assertStandardApprover(roles: ServiceContext["roles"]): void {
  if (roles.some((r) => r === "OWNER" || r === "ADMIN" || r === "PROCUREMENT")) return;
  throw new ServiceError("FORBIDDEN", "Sin permisos para aprobar esta orden de compra");
}
