import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";

export default async function ReportesInventarioPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  return (
    <PageShell variant="default" className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Reportes de inventario</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/inventario/reportes/stock"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Stock actual</h2>
        </Link>
        <Link
          href="/inventario/reportes/movimientos"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Movimientos</h2>
        </Link>
      </div>
    </PageShell>
  );
}
