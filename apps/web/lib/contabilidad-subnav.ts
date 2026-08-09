import type { ModuleSubnavLink } from "@/components/layout/module-subnav";

/**
 * Rutas reales bajo `/contabilidad` (GL interno gerencial — Phase 11F).
 */
export const CONTABILIDAD_SUBNAV_LINKS: ModuleSubnavLink[] = [
  { href: "/contabilidad", label: "Resumen", match: "exact", title: "Hub de contabilidad" },
  { href: "/contabilidad/cuentas", label: "Cuentas", title: "Plan de cuentas" },
  { href: "/contabilidad/asientos", label: "Asientos", title: "Asientos contables" },
  { href: "/contabilidad/cierres", label: "Cierres", title: "Cierre de períodos" },
  { href: "/contabilidad/reglas", label: "Reglas", title: "Reglas de mapeo" },
  { href: "/contabilidad/libro-diario", label: "Libro diario", title: "Libro diario (POSTED)" },
  { href: "/contabilidad/sumas-y-saldos", label: "Sumas y saldos", title: "Sumas y saldos" },
  {
    href: "/contabilidad/situacion-patrimonial",
    label: "Situación",
    title: "Estado de situación patrimonial",
  },
  {
    href: "/contabilidad/estado-resultados",
    label: "Resultados",
    title: "Estado de resultados",
  },
];
