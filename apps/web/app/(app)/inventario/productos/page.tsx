import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { listProducts } from "@bloqer/services";
import { ProductStatusBadge } from "@/features/inventory";

export default async function ProductosPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const products = await listProducts({}, ctx);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/inventario">← Volver</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Productos</h1>
        </div>
        <Button asChild>
          <Link href="/inventario/productos/nuevo">Nuevo producto</Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Catálogo de productos</h2>
        </div>
        <div className="p-6">
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay productos registrados.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">SKU</th>
                    <th className="px-4 py-2 text-left font-medium">Nombre</th>
                    <th className="px-4 py-2 text-left font-medium">Unidad</th>
                    <th className="px-4 py-2 text-left font-medium">Categoría</th>
                    <th className="px-4 py-2 text-left font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <Link href={`/inventario/productos/${p.id}`} className="font-mono hover:underline">
                          {p.sku}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{p.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.unit || "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.category || "—"}</td>
                      <td className="px-4 py-2"><ProductStatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
