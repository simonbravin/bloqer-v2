import type { ModuleSubnavLink } from "@/components/layout/module-subnav";

/**
 * Rutas reales bajo `/tesoreria`.
 * Extracto = detalle de cuenta; transferencias se descubren desde Cuentas (sin ítem de menú).
 */
export const TESORERIA_SUBNAV_LINKS: ModuleSubnavLink[] = [
  { href: "/tesoreria", label: "Resumen", match: "exact" },
  { href: "/tesoreria/cuentas", label: "Cuentas" },
  { href: "/tesoreria/flujo-caja", label: "Flujo de caja" },
  { href: "/tesoreria/conciliacion", label: "Conciliación" },
];
