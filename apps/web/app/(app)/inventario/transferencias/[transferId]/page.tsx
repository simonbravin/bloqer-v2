import { formatDate, formatDateTime } from "@/lib/format";
import { notFound, redirect } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTableSection } from "@/components/ui/data-table-section";
import { TableScroll } from "@/components/ui/table-scroll";
import { getCurrentUser } from "@/lib/auth";
import { getWarehouseTransferById, ServiceError } from "@bloqer/services";
import { WarehouseTransferStatusBadge } from "@/features/warehouse-transfer";
import { cancelWarehouseTransferAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ transferId: string }>;
}

const TYPE_LABELS: Record<string, string> = {
  TRANSFER_OUT: "Salida (origen)",
  TRANSFER_IN: "Entrada (destino)",
};

const MOVEMENT_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
};

function fmt(v: string) {
  return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return formatDate(d);
}

export default async function TransferenciaDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { transferId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let transfer;
  try {
    transfer = await getWarehouseTransferById(transferId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const doCancel = async () => {
    "use server";
    await cancelWarehouseTransferAction(transferId);
  };

  return (
    <PageShell variant="detail" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <PageBackLink href="/inventario/transferencias" label="Transferencias" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight font-mono">
                TR-{String(transfer.number).padStart(3, "0")}
              </h1>
              <WarehouseTransferStatusBadge status={transfer.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {fmtDate(transfer.transferDate.toISOString().slice(0, 10))}
            </p>
          </div>
        </div>
        {transfer.status === "CONFIRMED" && (
          <form action={doCancel}>
            <Button variant="outline" size="sm" type="submit">
              Cancelar transferencia
            </Button>
          </form>
        )}
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Datos de la transferencia</h2>
        </div>
        <dl className="grid grid-cols-2 gap-4 px-6 py-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Depósito origen</dt>
            <dd className="font-medium">{transfer.sourceWarehouseName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Depósito destino</dt>
            <dd className="font-medium">{transfer.destinationWarehouseName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Producto</dt>
            <dd className="font-medium">{transfer.productName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Cantidad</dt>
            <dd className="font-medium">
              {fmt(transfer.quantity)} {transfer.productUnit}
            </dd>
          </div>
          {transfer.unitCost && (
            <div>
              <dt className="text-muted-foreground">Costo unitario</dt>
              <dd className="font-medium">{fmt(transfer.unitCost)}</dd>
            </div>
          )}
          {transfer.totalCost && (
            <div>
              <dt className="text-muted-foreground">Costo total</dt>
              <dd className="font-medium">{fmt(transfer.totalCost)}</dd>
            </div>
          )}
          {transfer.notes && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Notas</dt>
              <dd className="whitespace-pre-wrap font-medium">{transfer.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      <DataTableSection title="Movimientos de stock">
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Depósito</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfer.stockMovements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{TYPE_LABELS[m.type] ?? m.type}</TableCell>
                  <TableCell>{m.warehouseName}</TableCell>
                  <TableCell>{fmtDate(m.movementDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(m.quantity)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {MOVEMENT_STATUS_LABELS[m.status] ?? m.status}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      </DataTableSection>
    </PageShell>
  );
}
