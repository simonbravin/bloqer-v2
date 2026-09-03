"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import type { ResourceBoardRow } from "@bloqer/services";
import type { ResourceBoardCategory } from "@bloqer/services/resource-board-pure";
import {
  canShowResourceInvoice,
  canShowResourcePedir,
  isResourceFieldShortage,
  resourceBoardPedirHref,
  resourceInvoiceHref,
  resourcePedirCtaLabel,
} from "@bloqer/services/resource-field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { Button } from "@/components/ui/button";
import { WbsItemDrilldownDialog } from "@/features/cost-control";
import { controlCostosItemHref } from "@/lib/control-costos-href";
import { formatDecimalArFromString, formatQtyFromString } from "@/lib/format-money";

type OpenWbs = { wbsNodeId: string; wbsCode: string; wbsName: string };

function isModifiedClick(e: MouseEvent) {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

type Props = {
  rows: ResourceBoardRow[];
  projectId: string;
  costCategory: ResourceBoardCategory;
  /** Hide Pedir / Factura CTAs when the user lacks permission. */
  canRequest?: boolean;
  canInvoice?: boolean;
  budgetId?: string;
};

export function ResourceBoardTable({
  rows,
  projectId,
  costCategory,
  canRequest = true,
  canInvoice = true,
  budgetId,
}: Props) {
  const [openItem, setOpenItem] = useState<OpenWbs | null>(null);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground p-4">
        No hay líneas APU para el filtro seleccionado. Probá otra ventana de cronograma o
        presupuesto, o revisá el APU en el presupuesto.
      </p>
    );
  }

  const showActions = canRequest || canInvoice;

  return (
    <div data-testid="resource-board-table">
      <TableScroll>
        <Table className="text-xs">
          <TableHeader className="sticky top-0 z-10 bg-muted/50">
            <TableRow>
              <TableHead className="w-24">EDT</TableHead>
              <TableHead>Insumo APU</TableHead>
              <TableHead className="text-right">Necesidad</TableHead>
              <TableHead
                className="text-right"
                title="Costo APU presupuestado de la línea (total). No baja con lo ya pedido."
              >
                $ Presup.
              </TableHead>
              <TableHead className="text-right">Pedido</TableHead>
              <TableHead className="text-right">Facturado</TableHead>
              <TableHead className="text-right">Faltante</TableHead>
              {showActions ? (
                <TableHead className="w-40">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const hasShortfall = isResourceFieldShortage(row);
              const showPedir = canShowResourcePedir(canRequest, row);
              const showInvoice = canShowResourceInvoice(canInvoice, row);
              const detailHref = controlCostosItemHref(projectId, row.wbsNodeId, { budgetId });

              return (
                <TableRow key={row.rowKey}>
                  <TableCell className="font-mono">
                    <a
                      href={detailHref}
                      className="text-primary hover:underline"
                      aria-haspopup="dialog"
                      aria-expanded={openItem?.wbsNodeId === row.wbsNodeId}
                      title="Ver detalle de la partida (Ctrl/Cmd+clic abre EDT completo)"
                      onClick={(e) => {
                        if (isModifiedClick(e)) return;
                        e.preventDefault();
                        setOpenItem({
                          wbsNodeId: row.wbsNodeId,
                          wbsCode: row.wbsCode,
                          wbsName: row.wbsName,
                        });
                      }}
                    >
                      {row.wbsCode}
                    </a>
                    {row.unscheduled ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">(sin fecha)</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[16rem]">
                    <span className="block truncate" title={row.description}>
                      {row.description}
                    </span>
                    {row.overCommitted ? (
                      <span className="block text-[10px] text-destructive">Sobrecomprometido</span>
                    ) : null}
                    {row.relatedPurchaseRequestId ? (
                      <Link
                        href={`/proyectos/${projectId}/solicitudes-compra/${row.relatedPurchaseRequestId}`}
                        className="mt-0.5 block text-[10px] text-primary hover:underline"
                      >
                        SC
                        {row.relatedPurchaseRequestNumber != null
                          ? ` #${row.relatedPurchaseRequestNumber}`
                          : ""}
                      </Link>
                    ) : null}
                    {row.relatedPurchaseOrderId ? (
                      <Link
                        href={`/proyectos/${projectId}/ordenes-compra/${row.relatedPurchaseOrderId}`}
                        className="mt-0.5 block text-[10px] text-primary hover:underline"
                      >
                        OC
                        {row.relatedPurchaseOrderNumber != null
                          ? ` #${row.relatedPurchaseOrderNumber}`
                          : ""}
                      </Link>
                    ) : null}
                    {row.relatedSupplierInvoiceId ? (
                      <Link
                        href={`/proyectos/${projectId}/facturas-proveedor/${row.relatedSupplierInvoiceId}`}
                        className="mt-0.5 block text-[10px] text-primary hover:underline"
                      >
                        FP
                        {row.relatedSupplierInvoiceNumber != null
                          ? ` #${row.relatedSupplierInvoiceNumber}`
                          : ""}
                      </Link>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatQtyFromString(row.needQty)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatDecimalArFromString(row.needCost)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatQtyFromString(row.orderedQty)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatQtyFromString(row.invoicedQty)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono tabular-nums ${hasShortfall ? "font-medium text-amber-700 dark:text-amber-400" : ""}`}
                  >
                    {formatQtyFromString(row.shortfallQty)}
                  </TableCell>
                  {showActions ? (
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {showPedir ? (
                          <Button asChild size="sm" variant="outline" className="h-7 whitespace-nowrap text-xs">
                            <Link href={resourceBoardPedirHref(projectId, row, costCategory)}>
                              {resourcePedirCtaLabel(row)}
                            </Link>
                          </Button>
                        ) : null}
                        {showInvoice ? (
                          <Button asChild size="sm" variant="outline" className="h-7 whitespace-nowrap text-xs">
                            <Link href={resourceInvoiceHref(projectId, row, costCategory)}>
                              Factura
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableScroll>

      <WbsItemDrilldownDialog
        open={openItem !== null}
        onOpenChange={(next) => {
          if (!next) setOpenItem(null);
        }}
        projectId={projectId}
        wbsNodeId={openItem?.wbsNodeId ?? null}
        wbsCode={openItem?.wbsCode ?? ""}
        wbsName={openItem?.wbsName ?? ""}
        filters={{ budgetId }}
      />
    </div>
  );
}
