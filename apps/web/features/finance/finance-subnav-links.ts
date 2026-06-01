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

  if (
    (gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP")) ||
    (gate.isEnabled("TREASURY") && can(ctx.roles, "VIEW", "TREASURY"))
  ) {
    links.push({
      href: "/finanzas/transacciones",
      label: "Transacciones",
      title: "Libro de caja consolidado (obra + empresa) y alta corporativa",
    });
  }

  if (gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP")) {
    links.push({
      href: "/finanzas/facturas-proveedor",
      label: "Facturas y gastos",
      title: "Facturas de proveedor corporativas (sin proyecto)",
    });
  }

  if (gate.isEnabled("AR") && can(ctx.roles, "VIEW", "AR")) {
    links.push({
      href: "/finanzas/cuentas-por-cobrar",
      label: "Cuentas por cobrar",
      title: "Saldos por cliente y vencimiento",
    });
  }

  if (gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP")) {
    links.push({
      href: "/finanzas/cuentas-por-pagar",
      label: "Cuentas por pagar",
      title: "Saldos por proveedor y vencimiento",
    });
    links.push({
      href: "/finanzas/gastos-generales",
      label: "Imputación GG",
      title: "Imputar gastos corporativos a obra (manual o automático por período)",
    });
  }

  if (gate.isEnabled("TREASURY") && can(ctx.roles, "VIEW", "TREASURY")) {
    links.push({ href: "/tesoreria", label: "Tesorería", title: "Caja, bancos y movimientos" });
  }

  return links;
}
