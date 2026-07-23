import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";

export default async function InventarioPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  return (
    <PageShell variant="default" className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Inventario</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/inventario/productos"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Productos</h2>
        </Link>
        <Link
          href="/inventario/depositos"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Depósitos</h2>
        </Link>
        <Link
          href="/inventario/movimientos"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Movimientos</h2>
        </Link>
        <Link
          href="/inventario/transferencias"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Transferencias</h2>
        </Link>
        <Link
          href="/inventario/reportes"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Reportes</h2>
        </Link>
      </div>
    </PageShell>
  );
}
