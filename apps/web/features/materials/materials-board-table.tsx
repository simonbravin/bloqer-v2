"use client";

import Link from "next/link";
import type { MaterialsBoardRow } from "@bloqer/services";
import {
  canShowMaterialsFieldPedir,
  isMaterialsFieldShortage,
  materialsBoardPedirHref,
  materialsPedirCtaLabel,
} from "@bloqer/services/materials-field";
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
import { formatDecimalArFromString } from "@/lib/format-money";
import { formatMaterialsFieldQty } from "./materials-field-format";

type Props = {
  rows: MaterialsBoardRow[];
  projectId: string;
  /** Hide Pedir CTA when user cannot create purchase requests. */
  canRequest?: boolean;
};

export function MaterialsBoardTable({ rows, projectId, canRequest = true }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground p-4">
        No hay líneas de material para el filtro seleccionado. Probá otra ventana de
        cronograma o presupuesto, o revisá el APU de materiales en el presupuesto.
      </p>
    );
  }

  return (
    <div data-testid="materials-board-table">
      <TableScroll>
        <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-muted/50">
          <TableRow>
            <TableHead className="w-24">EDT</TableHead>
            <TableHead>Material</TableHead>
            <TableHead className="text-right">Necesidad</TableHead>
            <TableHead
              className="text-right"
              title="Costo APU presupuestado de la línea (total). No baja con lo ya pedido."
            >
              $ Presup.
            </TableHead>
            <TableHead className="text-right">Pedido</TableHead>
            <TableHead className="text-right">Recibido</TableHead>
            <TableHead className="text-right">Consumido</TableHead>
            <TableHead className="text-right">Faltante</TableHead>
            {canRequest ? (
              <TableHead className="w-28">
                <span className="sr-only">Acciones</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const hasShortfall = isMaterialsFieldShortage(row);
            const showPedir = canShowMaterialsFieldPedir(canRequest, row);

            return (
              <TableRow key={row.rowKey}>
                <TableCell className="font-mono">
                  <Link
                    href={`/proyectos/${projectId}/control-costos/${row.wbsNodeId}`}
                    className="text-primary hover:underline"
                  >
                    {row.wbsCode}
                  </Link>
                  {row.unscheduled ? (
                    <span className="ml-1 text-[10px] text-muted-foreground">(sin fecha)</span>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-[16rem]">
                  <span className="truncate block" title={row.description}>
                    {row.description}
                  </span>
                  {row.missingProduct ? (
                    <span className="text-[10px] text-yellow-700 dark:text-yellow-400">
                      Sin producto vinculado
                    </span>
                  ) : null}
                  {row.overCommitted ? (
                    <span className="text-[10px] text-destructive block">Sobrecomprometido</span>
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
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatMaterialsFieldQty(row.needQty)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatDecimalArFromString(row.needCost)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatMaterialsFieldQty(row.orderedQty)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatMaterialsFieldQty(row.receivedQty)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatMaterialsFieldQty(row.consumedQty)}
                </TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${hasShortfall ? "font-medium text-amber-700 dark:text-amber-400" : ""}`}
                >
                  {formatMaterialsFieldQty(row.shortfallQty)}
                </TableCell>
                {canRequest ? (
                  <TableCell>
                    {showPedir ? (
                      <Button asChild size="sm" variant="outline" className="h-7 whitespace-nowrap text-xs">
                        <Link href={materialsBoardPedirHref(projectId, row)}>
                          {materialsPedirCtaLabel(row)}
                        </Link>
                      </Button>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
        </Table>
      </TableScroll>
    </div>
  );
}
