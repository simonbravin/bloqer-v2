import type { ModuleSubnavLink } from "@/components/layout/module-subnav";

/** Rutas reales bajo `/inventario` — sin inventar pantallas. */
export const INVENTARIO_SUBNAV_LINKS: ModuleSubnavLink[] = [
  { href: "/inventario", label: "Resumen", match: "exact", title: "Hub de inventario" },
  { href: "/inventario/productos", label: "Productos", title: "Catálogo de productos" },
  { href: "/inventario/depositos", label: "Depósitos", title: "Depósitos y stock" },
  { href: "/inventario/movimientos", label: "Movimientos", title: "Kardex / movimientos" },
  { href: "/inventario/transferencias", label: "Transferencias", title: "Traslado entre depósitos" },
  { href: "/inventario/reportes", label: "Reportes", title: "Reportes de inventario" },
];
