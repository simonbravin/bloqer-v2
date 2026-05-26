import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";

export default async function ReportesTesoreriaPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  if (!can(current.tenantCtx.roles, "VIEW", "TREASURY")) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/tesoreria">← Tesorería</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reportes de tesorería</h1>
          <p className="text-sm text-muted-foreground mt-1">Posición de caja, movimientos y flujo de fondos.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/tesoreria/reportes/posicion-caja"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Posición de caja</h2>
          <p className="text-sm text-muted-foreground mt-1">Saldos por cuenta, moneda y empresa</p>
        </Link>
        <Link
          href="/tesoreria/reportes/movimientos"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Movimientos</h2>
          <p className="text-sm text-muted-foreground mt-1">Libro mayor filtrable de caja ejecutada</p>
        </Link>
        <Link
          href="/tesoreria/reportes/flujo-caja"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Flujo de caja</h2>
          <p className="text-sm text-muted-foreground mt-1">Ingresos y egresos por período</p>
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">
        Solo movimientos confirmados. No incluye cuentas por cobrar ni cuentas por pagar (ver Finanzas).
        Sin conversión de moneda: cada moneda se muestra por separado.
      </p>
    </div>
  );
}
