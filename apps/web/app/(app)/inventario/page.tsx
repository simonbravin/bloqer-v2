import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function InventarioPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventario</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gestión de productos, depósitos y movimientos de stock.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/inventario/productos"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Productos</h2>
          <p className="text-sm text-muted-foreground mt-1">Catálogo de materiales e insumos</p>
        </Link>
        <Link
          href="/inventario/depositos"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Depósitos</h2>
          <p className="text-sm text-muted-foreground mt-1">Almacenes y ubicaciones de stock</p>
        </Link>
        <Link
          href="/inventario/movimientos"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Movimientos</h2>
          <p className="text-sm text-muted-foreground mt-1">Historial de entradas y salidas</p>
        </Link>
        <Link
          href="/inventario/transferencias"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Transferencias</h2>
          <p className="text-sm text-muted-foreground mt-1">Movimientos entre depósitos</p>
        </Link>
        <Link
          href="/inventario/reportes"
          className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
        >
          <h2 className="font-semibold">Reportes</h2>
          <p className="text-sm text-muted-foreground mt-1">Stock actual y kardex de movimientos</p>
        </Link>
      </div>
    </div>
  );
}
