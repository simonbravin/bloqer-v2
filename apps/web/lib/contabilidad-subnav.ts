import type { ModuleSubnavLink } from "@/components/layout/module-subnav";

/**
 * Rutas reales bajo `/contabilidad`.
 * Contabilidad en esta versión = sugerencias/manual; sin features nuevas.
 */
export const CONTABILIDAD_SUBNAV_LINKS: ModuleSubnavLink[] = [
  { href: "/contabilidad", label: "Resumen", match: "exact", title: "Hub de contabilidad" },
  { href: "/contabilidad/cuentas", label: "Cuentas", title: "Plan de cuentas" },
  { href: "/contabilidad/asientos", label: "Asientos", title: "Asientos contables" },
  { href: "/contabilidad/reglas", label: "Reglas", title: "Reglas de mapeo" },
];
