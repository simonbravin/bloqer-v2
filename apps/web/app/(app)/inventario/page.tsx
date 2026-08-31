import { redirect } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  Package,
  ScrollText,
  Warehouse,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { InventarioHubCards } from "@/features/inventory";
import { PageShell } from "@/components/layout/page-shell";

export default async function InventarioPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  return (
    <PageShell variant="default" className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Inventario</h1>

      <InventarioHubCards
        cards={[
          {
            href: "/inventario/productos",
            title: "Productos",
            description: "Catálogo con SKU, unidad y categoría.",
            icon: Package,
          },
          {
            href: "/inventario/depositos",
            title: "Depósitos",
            description: "Ubicaciones y stock por depósito.",
            icon: Warehouse,
          },
          {
            href: "/inventario/movimientos",
            title: "Movimientos",
            description: "Kardex de ingresos, egresos y ajustes.",
            icon: ScrollText,
          },
          {
            href: "/inventario/transferencias",
            title: "Transferencias",
            description: "Traslado de stock entre depósitos.",
            icon: ArrowLeftRight,
          },
          {
            href: "/inventario/reportes",
            title: "Reportes",
            description: "Stock actual y movimientos confirmados.",
            icon: BarChart3,
          },
        ]}
      />
    </PageShell>
  );
}
