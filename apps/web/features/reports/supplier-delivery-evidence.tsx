import Link from "next/link";
import type { SupplierDeliveryEvidence } from "@bloqer/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { PurchaseOrderStatusBadge } from "@/features/procurement/components/purchase-order-status-badge";

function calendarDate(iso: string | null) {
  return iso ? iso.split("-").reverse().join("/") : "Sin dato";
}

export function SupplierDeliveryEvidencePanel({ rows, projectId }: {
  rows: SupplierDeliveryEvidence[];
  projectId: string;
}) {
  return (
    <Card role="region" aria-label="Entregas y cobertura de datos" className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Entregas y cobertura de datos</CardTitle>
        <p className="text-sm text-muted-foreground">
          Órdenes emitidas en el período y la moneda seleccionados. Los estados son los actuales;
          las recepciones confirmadas pueden ser posteriores al período.
        </p>
        <p className="text-xs text-muted-foreground">
          La última recepción no acredita la fecha de entrega completa. Estos datos no califican puntualidad ni calidad del proveedor.
        </p>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        {rows.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Sin órdenes confirmadas para este recorte.</p> : rows.map(row => (
          <details key={row.supplierContactId} className="group min-w-0 rounded-lg border">
            <summary className="min-h-11 cursor-pointer rounded-lg px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="break-words font-medium">{row.supplierName}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {row.orderCount} OC · {row.receivedCount} recibidas · {row.partiallyReceivedCount} parciales · {row.confirmedCount} confirmadas
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Fecha prevista: {row.withExpectedDateCount} de {row.orderCount} OC · Con recepción registrada: {row.withReceiptCount} de {row.orderCount} OC
              </span>
              <span className="mt-2 block text-xs text-primary group-open:hidden">Ver órdenes y fechas</span>
              <span className="mt-2 hidden text-xs text-primary group-open:block">Ocultar órdenes</span>
            </summary>
            <div className="min-w-0 border-t p-3">
              <TableScroll>
                <Table aria-label={`Órdenes de ${row.supplierName}`} className="text-sm">
                  <TableHeader><TableRow>
                    <TableHead>Orden</TableHead><TableHead>Estado actual</TableHead><TableHead>Emitida</TableHead>
                    <TableHead>Entrega prevista</TableHead><TableHead>Última recepción</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{row.orders.map(order => (
                    <TableRow key={order.id}>
                      <TableCell><Link href={`/proyectos/${projectId}/ordenes-compra/${order.id}`} className="inline-flex min-h-11 items-center whitespace-nowrap font-medium text-primary underline-offset-4 hover:underline">
                        OC-{String(order.number).padStart(3, "0")}
                      </Link></TableCell>
                      <TableCell><PurchaseOrderStatusBadge status={order.status} /></TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{calendarDate(order.issueDate)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{calendarDate(order.expectedDeliveryDate)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{order.lastReceiptDate ? calendarDate(order.lastReceiptDate) : "Sin recepción registrada"}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </TableScroll>
            </div>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}
