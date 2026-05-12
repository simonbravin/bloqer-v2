import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getWarehouseTransferById, ServiceError } from "@bloqer/services";
import { WarehouseTransferStatusBadge } from "@/features/warehouse-transfer";
import { cancelWarehouseTransferAction } from "../actions";

interface PageProps {
  params: Promise<{ transferId: string }>;
}

const TYPE_LABELS: Record<string, string> = {
  TRANSFER_OUT: "Salida (origen)",
  TRANSFER_IN:  "Entrada (destino)",
};

const MOVEMENT_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
};

function fmt(v: string) {
  return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR");
}

export default async function TransferenciaDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { transferId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/inventario/transferencias">← Transferencias</Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight font-mono">
                TR-{String(transfer.number).padStart(3, "0")}
              </h1>
              <WarehouseTransferStatusBadge status={transfer.status} />
            </div>
            <p className="text-sm text-muted-foreground">{fmtDate(transfer.transferDate.toISOString().slice(0,10))}</p>
          </div>
        </div>
        {transfer.status === "CONFIRMED" && (
          <form action={doCancel}>
            <Button variant="outline" size="sm" type="submit">Cancelar transferencia</Button>
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
            <dd className="font-medium">{fmt(transfer.quantity)} {transfer.productUnit}</dd>
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

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Movimientos de stock</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="px-6 py-2.5 text-left font-medium">Tipo</th>
              <th className="px-6 py-2.5 text-left font-medium">Depósito</th>
              <th className="px-6 py-2.5 text-left font-medium">Fecha</th>
              <th className="px-6 py-2.5 text-right font-medium">Cantidad</th>
              <th className="px-6 py-2.5 text-left font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {transfer.stockMovements.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-6 py-2.5">{TYPE_LABELS[m.type] ?? m.type}</td>
                <td className="px-6 py-2.5">{m.warehouseName}</td>
                <td className="px-6 py-2.5">{fmtDate(m.movementDate)}</td>
                <td className="px-6 py-2.5 text-right tabular-nums">{fmt(m.quantity)}</td>
                <td className="px-6 py-2.5 text-muted-foreground text-xs">
                  {MOVEMENT_STATUS_LABELS[m.status] ?? m.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
