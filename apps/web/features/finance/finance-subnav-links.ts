import { can } from "@bloqer/domain";
import type { ServiceContext } from "@bloqer/services";
import { canViewCompanyFinanceHub, getTenantModuleGate } from "@bloqer/services";

export type FinanceSubnavLinkDTO = {
  href: string;
  label: string;
  /** Optional context for hover / screen readers */
  title?: string;
};

/**
 * Real routes only; each item requires tenant module + VIEW permission.
 * Resumen only for company-finance roles (D-056).
 */
export async function getFinanceSubnavLinks(ctx: ServiceContext): Promise<FinanceSubnavLinkDTO[]> {
  const gate = await getTenantModuleGate(ctx);
  if (!canViewCompanyFinanceHub(ctx.roles)) {
    return [];
  }

  const links: FinanceSubnavLinkDTO[] = [{ href: "/finanzas", label: "Resumen" }];

  if (
    (gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP")) ||
    (gate.isEnabled("AR") && can(ctx.roles, "VIEW", "AR")) ||
    (gate.isEnabled("TREASURY") && can(ctx.roles, "VIEW", "TREASURY"))
  ) {
    links.push({
      href: "/finanzas/transacciones",
      label: "Transacciones",
    });
  }

  if (gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP")) {
    links.push({
      href: "/finanzas/facturas-proveedor",
      label: "Facturas y gastos",
    });
  }

  if (gate.isEnabled("AR") && can(ctx.roles, "VIEW", "AR")) {
    links.push({
      href: "/finanzas/cuentas-por-cobrar",
      label: "Cuentas por cobrar",
    });
  }

  if (gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP")) {
    links.push({
      href: "/finanzas/cuentas-por-pagar",
      label: "Cuentas por pagar",
    });
    links.push({
      href: "/finanzas/gastos-generales",
      label: "Imputación GG",
    });
  }

  return links;
}
