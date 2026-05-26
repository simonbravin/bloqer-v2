import { can } from "@bloqer/domain";
import type { ServiceContext } from "@bloqer/services";
import { getTenantModuleGate } from "@bloqer/services";

export type FinanceSubnavLinkDTO = {
  href: string;
  label: string;
  /** Optional context for hover / screen readers */
  title?: string;
};

/**
 * Real routes only; each item requires tenant module + VIEW permission (except Resumen).
 */
export async function getFinanceSubnavLinks(ctx: ServiceContext): Promise<FinanceSubnavLinkDTO[]> {
  const gate = await getTenantModuleGate(ctx);
  const links: FinanceSubnavLinkDTO[] = [{ href: "/finanzas", label: "Resumen", title: "Tablero financiero de la empresa" }];

  if (gate.isEnabled("AR") && can(ctx.roles, "VIEW", "AR")) {
    links.push({
      href:  "/finanzas/cuentas-por-cobrar-aging",
      label: "Cuentas por cobrar",
      title: "Saldos por cliente y vencimiento",
    });
  }

  if (gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP")) {
    links.push({
      href:  "/finanzas/gastos-generales",
      label: "Gastos generales",
      title: "Asistente para facturas de proveedor sin proyecto",
    });
    links.push({
      href:  "/finanzas/facturas-proveedor",
      label: "Facturas y gastos",
      title: "Facturas de proveedor y gastos generales sin proyecto",
    });
    links.push({
      href:  "/finanzas/cuentas-por-pagar",
      label: "Pagos pendientes",
      title: "Obligaciones de empresa sin imputar a obra",
    });
    links.push({
      href:  "/finanzas/cuentas-por-pagar-aging",
      label: "Cuentas por pagar",
      title: "Saldos por proveedor y vencimiento",
    });
  }

  if (gate.isEnabled("TREASURY") && can(ctx.roles, "VIEW", "TREASURY")) {
    links.push({ href: "/tesoreria", label: "Tesorería", title: "Caja, bancos y movimientos" });
  }

  if (gate.isEnabled("ACCOUNTING") && can(ctx.roles, "VIEW", "ACCOUNTING")) {
    links.push({ href: "/contabilidad", label: "Contabilidad", title: "Libro mayor y asientos" });
  }

  return links;
}
