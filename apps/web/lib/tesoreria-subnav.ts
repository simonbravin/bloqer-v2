import type { ModuleSubnavLink } from "@/components/layout/module-subnav";

/** Rutas reales bajo `/tesoreria` — sin inventar pantallas. */
export const TESORERIA_SUBNAV_LINKS: ModuleSubnavLink[] = [
  { href: "/tesoreria", label: "Resumen", match: "exact", title: "Hub de tesorería" },
  { href: "/tesoreria/cuentas", label: "Cuentas", title: "Cajas y bancos" },
  { href: "/tesoreria/transferencias", label: "Transferencias", title: "Transferencias internas" },
  { href: "/tesoreria/reportes", label: "Reportes", title: "Reportes de tesorería" },
];
