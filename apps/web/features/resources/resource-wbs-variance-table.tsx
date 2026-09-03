"use client";

import { useState, type MouseEvent } from "react";
import type { ResourceWbsVarianceRow } from "@bloqer/services";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { WbsItemDrilldownDialog } from "@/features/cost-control";
import { controlCostosItemHref } from "@/lib/control-costos-href";
import { formatMoneyAmount } from "@/lib/format-money";

type OpenWbs = { wbsNodeId: string; wbsCode: string; wbsName: string };

function isModifiedClick(e: MouseEvent) {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

type Props = {
  rows: ResourceWbsVarianceRow[];
  projectId: string;
  budgetId?: string;
  dateFrom?: string;
  dateTo?: string;
  currency?: string;
};

export function ResourceWbsVarianceTable({
  rows,
  projectId,
  budgetId,
  dateFrom,
  dateTo,
  currency,
}: Props) {
  const [openItem, setOpenItem] = useState<OpenWbs | null>(null);
  const drillFilters = { budgetId, dateFrom, dateTo };

  if (rows.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No hay partidas con presupuesto o gasto facturado de este tipo.
      </p>
    );
  }

  return (
    <>
      <TableScroll>
        <Table className="text-xs">
          <TableHeader className="sticky top-0 z-10 bg-muted/50">
            <TableRow>
              <TableHead className="w-24">Partida</TableHead>
              <TableHead>Ítem</TableHead>
              <TableHead className="text-right">Presupuesto</TableHead>
              <TableHead className="text-right">Facturado (neto)</TableHead>
              <TableHead className="text-right">Variación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const detailHref = controlCostosItemHref(projectId, row.wbsNodeId, drillFilters);
              return (
                <TableRow key={row.wbsNodeId}>
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
                  </TableCell>
                  <TableCell className="max-w-[min(18rem,35vw)] truncate" title={row.wbsName}>
                    {row.wbsName}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoneyAmount(row.budgetCost, currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoneyAmount(row.accruedCost, currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoneyAmount(row.variance, currency)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="px-1 pt-2 text-xs text-muted-foreground">
          Facturado = neto sin IVA (misma base que EDT y costos). Tocá el código EDT para ver el
          detalle sin salir del tablero (mismos filtros de presupuesto/fecha que la tabla).
        </p>
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
        filters={drillFilters}
      />
    </>
  );
}
