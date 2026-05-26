import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { listWarehouseTransfers } from "@bloqer/services";
import { WarehouseTransferStatusBadge } from "@/features/warehouse-transfer";

export default async function TransferenciasPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const transfers = await listWarehouseTransfers({}, ctx);

  function fmt(v: string) {
    return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2 });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/inventario">← Inventario</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Transferencias de depósito</h1>
        </div>
        <Button asChild size="sm">
          <Link href="/inventario/transferencias/nueva">Nueva transferencia</Link>
        </Button>
      </div>

      {transfers.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          No hay transferencias registradas.
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">N°</th>
                <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
                <th className="px-4 py-2.5 text-left font-medium">Origen</th>
                <th className="px-4 py-2.5 text-left font-medium">Destino</th>
                <th className="px-4 py-2.5 text-left font-medium">Producto</th>
                <th className="px-4 py-2.5 text-right font-medium">Cantidad</th>
                <th className="px-4 py-2.5 text-left font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/inventario/transferencias/${t.id}`}
                      className="font-mono text-primary hover:underline"
                    >
                      TR-{String(t.number).padStart(3, "0")}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {formatDate(t.transferDate )}
                  </td>
                  <td className="px-4 py-2.5">{t.sourceWarehouseName}</td>
                  <td className="px-4 py-2.5">{t.destinationWarehouseName}</td>
                  <td className="px-4 py-2.5">{t.productName}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {fmt(t.quantity)} {t.productUnit}
                  </td>
                  <td className="px-4 py-2.5">
                    <WarehouseTransferStatusBadge status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
