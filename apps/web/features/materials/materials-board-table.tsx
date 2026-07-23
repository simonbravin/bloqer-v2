"use client";

import Link from "next/link";
import type { MaterialsBoardRow } from "@bloqer/services";
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

/** Qty display es-AR without IEEE float (trim trailing zeros). */
function fmtQty(raw: string): string {
  const t = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return raw;
  const sign = t.startsWith("-") ? "-" : "";
  const abs = sign ? t.slice(1) : t;
  const [intPart, decPart = ""] = abs.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const trimmedDec = decPart.replace(/0+$/, "").slice(0, 4);
  return trimmedDec ? `${sign}${withThousands},${trimmedDec}` : `${sign}${withThousands}`;
}

function shortfallForPrefill(raw: string): string {
  const t = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return t;
  const [i, d = ""] = t.split(".");
  const trimmed = d.replace(/0+$/, "").slice(0, 4);
  return trimmed ? `${i}.${trimmed}` : i;
}

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
    <TableScroll>
      <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-muted/50">
          <TableRow>
            <TableHead className="w-24">EDT</TableHead>
            <TableHead>Material</TableHead>
            <TableHead className="text-right">Necesidad</TableHead>
            <TableHead className="text-right">$ Presup.</TableHead>
            <TableHead className="text-right">Pedido</TableHead>
            <TableHead className="text-right">Recibido</TableHead>
            <TableHead className="text-right">Consumido</TableHead>
            <TableHead className="text-right">Faltante</TableHead>
            {canRequest ? (
              <TableHead className="w-20">
                <span className="sr-only">Acciones</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const hasShortfall = !/^-?0+(\.0+)?$/.test(row.shortfallQty.trim());
            const pedirHref = `/proyectos/${projectId}/solicitudes-compra/nueva?wbsNodeId=${encodeURIComponent(row.wbsNodeId)}&description=${encodeURIComponent(row.description)}&quantity=${encodeURIComponent(shortfallForPrefill(row.shortfallQty))}${row.productId ? `&productId=${encodeURIComponent(row.productId)}` : ""}&from=materiales`;

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
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {fmtQty(row.needQty)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatDecimalArFromString(row.needCost)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {fmtQty(row.orderedQty)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {fmtQty(row.receivedQty)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {fmtQty(row.consumedQty)}
                </TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${hasShortfall ? "font-medium text-amber-700 dark:text-amber-400" : ""}`}
                >
                  {fmtQty(row.shortfallQty)}
                </TableCell>
                {canRequest ? (
                  <TableCell>
                    {hasShortfall ? (
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                        <Link href={pedirHref}>Pedir</Link>
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
  );
}
