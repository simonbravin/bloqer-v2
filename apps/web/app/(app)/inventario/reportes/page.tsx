import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

export default async function ReportesInventarioPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href="/inventario" label="Inventario" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reportes de inventario</h1>
          <p className="text-sm text-muted-foreground mt-1">Stock y movimientos en tiempo real.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/inventario/reportes/stock"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Stock actual</h2>
          <p className="text-sm text-muted-foreground mt-1">Balance por producto y depósito</p>
        </Link>
        <Link
          href="/inventario/reportes/movimientos"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Movimientos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Historial filtrable de entradas y salidas
          </p>
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">
        Solo movimientos confirmados. Sin valuación FIFO/AVG. Ajustes expuestos por separado.
      </p>
    </PageShell>
  );
}
