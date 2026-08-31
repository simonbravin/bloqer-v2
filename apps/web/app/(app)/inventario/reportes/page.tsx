import { redirect } from "next/navigation";
import { PackageSearch, ScrollText } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { InventarioHubCards } from "@/features/inventory";
import { PageShell } from "@/components/layout/page-shell";

export default async function ReportesInventarioPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  return (
    <PageShell variant="default" className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Reportes de inventario</h1>

      <InventarioHubCards
        cards={[
          {
            href: "/inventario/reportes/stock",
            title: "Stock actual",
            description: "Saldos por producto y depósito.",
            icon: PackageSearch,
          },
          {
            href: "/inventario/reportes/movimientos",
            title: "Movimientos",
            description: "Historial confirmado con filtros.",
            icon: ScrollText,
          },
        ]}
      />
    </PageShell>
  );
}
