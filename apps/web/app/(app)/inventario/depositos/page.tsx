import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { listWarehouses } from "@bloqer/services";
import { WarehouseStatusBadge } from "@/features/inventory";

const TYPE_LABELS: Record<string, string> = {
  CENTRAL: "Central", PROJECT: "Proyecto", TEMPORARY: "Temporal", OTHER: "Otro",
};

export default async function DepositosPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const warehouses = await listWarehouses({}, ctx);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/inventario">← Volver</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Depósitos</h1>
        </div>
        <Button asChild>
          <Link href="/inventario/depositos/nuevo">Nuevo depósito</Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Depósitos registrados</h2>
        </div>
        <div className="p-6">
          {warehouses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay depósitos registrados.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Nombre</th>
                    <th className="px-4 py-2 text-left font-medium">Tipo</th>
                    <th className="px-4 py-2 text-left font-medium">Dirección</th>
                    <th className="px-4 py-2 text-left font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {warehouses.map((w) => (
                    <tr key={w.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <Link href={`/inventario/depositos/${w.id}`} className="hover:underline font-medium">
                          {w.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {TYPE_LABELS[w.type] ?? w.type}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{w.address || "—"}</td>
                      <td className="px-4 py-2"><WarehouseStatusBadge status={w.status} /></td>
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
