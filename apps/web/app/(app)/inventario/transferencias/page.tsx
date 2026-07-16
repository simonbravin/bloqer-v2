import { formatDate } from "@/lib/format";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth";
import { listWarehouseTransfers } from "@bloqer/services";
import { WarehouseTransferStatusBadge } from "@/features/warehouse-transfer";
import { PageShell } from "@/components/layout/page-shell";

export default async function TransferenciasPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const transfers = await listWarehouseTransfers({}, ctx);

  function fmt(v: string) {
    return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2 });
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Transferencias de depósito</h1>
        </div>
        <Button asChild size="sm">
          <Link href="/inventario/transferencias/nueva">Nueva transferencia</Link>
        </Button>
      </div>

      {transfers.length === 0 ? (
        <ListEmptyState
          title="Sin transferencias"
          description="Mové stock entre depósitos cuando haga falta reponer obra o centralizar materiales."
          action={
            <Button asChild size="sm">
              <Link href="/inventario/transferencias/nueva">Nueva transferencia</Link>
            </Button>
          }
        />
      ) : (
        <TableScroll stickyFirstColumn>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link
                      href={`/inventario/transferencias/${t.id}`}
                      className="font-mono text-primary hover:underline"
                    >
                      TR-{String(t.number).padStart(3, "0")}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(t.transferDate)}</TableCell>
                  <TableCell>{t.sourceWarehouseName}</TableCell>
                  <TableCell>{t.destinationWarehouseName}</TableCell>
                  <TableCell>{t.productName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(t.quantity)} {t.productUnit}
                  </TableCell>
                  <TableCell>
                    <WarehouseTransferStatusBadge status={t.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      )}
    </PageShell>
  );
}
