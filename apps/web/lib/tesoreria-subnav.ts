import type { ModuleSubnavLink } from "@/components/layout/module-subnav";

/** Rutas reales bajo `/tesoreria` — sin inventar pantallas. */
export const TESORERIA_SUBNAV_LINKS: ModuleSubnavLink[] = [
  { href: "/tesoreria", label: "Resumen", match: "exact" },
  { href: "/tesoreria/cuentas", label: "Cuentas" },
  { href: "/tesoreria/posicion-caja", label: "Posición de caja" },
  { href: "/tesoreria/movimientos", label: "Movimientos" },
  { href: "/tesoreria/flujo-caja", label: "Flujo de caja" },
  { href: "/tesoreria/transferencias", label: "Transferencias" },
];
