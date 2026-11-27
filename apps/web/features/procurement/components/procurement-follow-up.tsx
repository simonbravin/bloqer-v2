import Link from "next/link";
import { getProjectProcurementFollowUp, type ServiceContext } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoneyAmount, formatQtyFromString } from "@/lib/format-money";
import { procurementActionBtnClass } from "../lib/procurement-ui";
import { ProcurementAmberCallout } from "./procurement-amber-callout";
import { PurchaseOrderStatusBadge } from "./purchase-order-status-badge";

export async function ProcurementFollowUp({ projectId, ctx, page }: { projectId: string; ctx: ServiceContext; page: number }) {
  const data = await getProjectProcurementFollowUp(projectId, ctx, page);
  return <ProcurementFollowUpPanel projectId={projectId} data={data} />;
}

export function ProcurementFollowUpPanel({ projectId, data }: {
  projectId: string;
  data: Awaited<ReturnType<typeof getProjectProcurementFollowUp>>;
}) {
  const base = `/proyectos/${projectId}`;
  const pageHref = (page: number) => `${base}/compras?ocPage=${page}#seguimiento-oc`;
  return (
    <Card id="seguimiento-oc" role="region" aria-labelledby="seguimiento-oc-title" className="min-w-0 scroll-mt-24">
      <CardHeader>
        <CardTitle id="seguimiento-oc-title" className="text-base">Recepción y facturación por OC</CardTitle>
        <p className="text-sm text-muted-foreground">
          Revisá entregas pendientes, borradores y diferencias en las órdenes confirmadas. La recepción y la facturación se controlan por separado.
        </p>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <p className="text-xs text-muted-foreground">
          {data.total} órdenes confirmadas, parciales o recibidas · Más recientes por número primero · Hasta {data.pageSize} por página.
          {" "}Los avisos corresponden a estas órdenes; no son un total de pendientes de la obra ni certifican que estén pagadas.
        </p>
        {data.rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {data.total === 0 ? "Todavía no hay órdenes confirmadas para revisar." : "No hay órdenes en esta página. Volvé a la primera página."}
          </p>
        ) : data.rows.map((row) => {
          const href = `${base}/ordenes-compra/${row.id}`;
          const billing = row.billing;
          return (
            <article key={row.id} aria-label={`Seguimiento ${row.code}`} className="min-w-0 rounded-lg border p-4 space-y-3">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="font-medium break-words">{row.code} · {row.supplierName}</h3>
                  <PurchaseOrderStatusBadge status={row.status} />
                </div>
                <Button asChild variant="outline" className={procurementActionBtnClass}>
                  <Link href={href}>Abrir {row.code}</Link>
                </Button>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="font-medium">Recepción</p>
                  <p className="text-muted-foreground">{row.status === "RECEIVED" ? "Recepción completa registrada." : "Queda entrega pendiente. Revisá las recepciones en la OC."}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="font-medium">Facturación</p>
                  <p className="text-muted-foreground">{!billing ? row.billingNotice :
                    !billing.hasReceivedQuantity ? "Sin cantidades recibidas para comprobar cobertura." :
                    billing.allReceivedAmountIssued && billing.allReceivedInvoiceLinesIssued ? "Lo recibido tiene cobertura de facturas emitidas. No equivale a pago." :
                    "Lo recibido aún no tiene cobertura completa de facturas emitidas."}</p>
                  {billing && billing.draftInvoiceCount > 0 ? <p className="mt-1">{billing.draftInvoiceCount} borrador(es) por completar o emitir.</p> : null}
                </div>
              </div>
              {billing ? <>
                {billing.matchWarningCount > 0 || billing.unlinkedInvoiceCount > 0 ? (
                  <ProcurementAmberCallout>
                    <p className="font-medium">Revisar documentos</p>
                    {billing.matchWarningCount > 0 ? <p>{billing.matchWarningCount} aviso(s) de cantidad entre OC, recepción y factura. Son avisos; no bloquean emitir.</p> : null}
                    {billing.unlinkedInvoiceCount > 0 ? <p>{billing.unlinkedInvoiceCount} factura(s) con ítems sin vínculo a las líneas de la OC. Sus importes cuentan, pero no se puede comprobar toda la cobertura por cantidad.</p> : null}
                  </ProcurementAmberCallout>
                ) : null}
                <details className="min-w-0 rounded-md border">
                  <summary className="min-h-11 cursor-pointer rounded-md px-3 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ver cantidades e importes · {billing.currency}</summary>
                  <div className="min-w-0 space-y-3 border-t p-3">
                    <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                      {([
                        ["Recibido", billing.receivedAmount], ["Facturas emitidas", billing.invoicedAmount],
                        ["Reservado en borradores", billing.draftReservedAmount], ["Pendiente sin reservar", billing.pendingToInvoice],
                      ] as const).map(([label, amount]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium tabular-nums">{formatMoneyAmount(amount, billing.currency)}</dd></div>)}
                    </dl>
                    <p className="text-xs text-muted-foreground">Importes neto + IVA, sin percepciones. Reservar en borrador no equivale a emitir. Las cantidades en facturas incluyen borradores y emitidas; se leen por ítem, sin sumar unidades diferentes. Las notas de crédito y débito no agregan cobertura física.</p>
                    <Table aria-label={`Cantidades de ${row.code}`}>
                      <TableHeader><TableRow><TableHead>Ítem</TableHead><TableHead className="text-right">Pedido</TableHead><TableHead className="text-right">Recibido</TableHead><TableHead className="text-right">En facturas y borradores</TableHead><TableHead>Revisión</TableHead></TableRow></TableHeader>
                      <TableBody>{billing.lineMatches.map((line) => <TableRow key={line.poLineId}>
                        <TableCell className="min-w-40 max-w-64 whitespace-normal break-words">{line.description}<span className="block text-xs text-muted-foreground">Unidad: {row.lineUnits[line.poLineId] || "No informada"}</span></TableCell>
                        <TableCell className="text-right tabular-nums">{formatQtyFromString(line.orderQty)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQtyFromString(line.receivedQty)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQtyFromString(line.invoicedQty)}</TableCell>
                        <TableCell className="min-w-48 max-w-80 whitespace-normal">{line.message ?? "Sin aviso de exceso de cantidad."}</TableCell>
                      </TableRow>)}</TableBody>
                    </Table>
                  </div>
                </details>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" className={procurementActionBtnClass}><Link href={`${href}?siguiente=facturar#facturar`}>Revisar facturación</Link></Button>
                  {billing.openDraftInvoiceId ? <Button asChild variant="outline" className={procurementActionBtnClass}><Link href={`${base}/facturas-proveedor/${billing.openDraftInvoiceId}`}>Abrir borrador</Link></Button> : null}
                </div>
              </> : null}
            </article>
          );
        })}
        <nav aria-label="Páginas de seguimiento de órdenes" className="flex flex-wrap items-center gap-2">
          {data.page > 1 ? <Button asChild variant="outline" className={procurementActionBtnClass}><Link href={pageHref(1)}>Primera página</Link></Button> : null}
          {data.page > 1 ? <Button asChild variant="outline" className={procurementActionBtnClass}><Link href={pageHref(data.page - 1)}>Anterior</Link></Button> : null}
          <span className="text-sm text-muted-foreground">Página {data.page}</span>
          {data.page * data.pageSize < data.total ? <Button asChild variant="outline" className={procurementActionBtnClass}><Link href={pageHref(data.page + 1)}>Siguiente</Link></Button> : null}
        </nav>
      </CardContent>
    </Card>
  );
}
