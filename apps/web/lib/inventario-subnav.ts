import type { ModuleSubnavLink } from "@/components/layout/module-subnav";

/** Rutas reales bajo `/inventario` — sin inventar pantallas. */
export const INVENTARIO_SUBNAV_LINKS: ModuleSubnavLink[] = [
  { href: "/inventario", label: "Resumen", match: "exact", title: "Hub de inventario", icon: "dashboard" },
  { href: "/inventario/productos", label: "Productos", title: "Catálogo de productos", icon: "package" },
  { href: "/inventario/depositos", label: "Depósitos", title: "Depósitos y stock", icon: "warehouse" },
  { href: "/inventario/movimientos", label: "Movimientos", title: "Kardex / movimientos", icon: "scroll" },
  { href: "/inventario/transferencias", label: "Transferencias", title: "Traslado entre depósitos", icon: "transfer" },
  { href: "/inventario/reportes", label: "Reportes", title: "Reportes de inventario", icon: "reports" },
];
