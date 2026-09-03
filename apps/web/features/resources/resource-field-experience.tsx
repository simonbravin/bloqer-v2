"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import type { ResourceBoardCategory } from "@bloqer/services/resource-board-pure";
import type { ResourceFieldRow } from "@bloqer/services/resource-field";
import {
  canShowResourceInvoice,
  canShowResourcePedir,
  isResourceFieldShortage,
  resourceFieldPedirHref,
  resourceInvoiceHref,
  resourcePedirCtaLabel,
} from "@bloqer/services/resource-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WbsItemDrilldownDialog } from "@/features/cost-control";
import { controlCostosItemHref } from "@/lib/control-costos-href";
import { formatQtyFromString } from "@/lib/format-money";

type OpenWbs = { wbsNodeId: string; wbsCode: string; wbsName: string };

function isModifiedClick(e: MouseEvent) {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

type Props = {
  projectId: string;
  costCategory: ResourceBoardCategory;
  rows: ResourceFieldRow[];
  canRequest: boolean;
  canInvoice: boolean;
  budgetId?: string;
};

export function ResourceFieldExperience({
  projectId,
  costCategory,
  rows,
  canRequest,
  canInvoice,
  budgetId,
}: Props) {
  const [openItem, setOpenItem] = useState<OpenWbs | null>(null);
  const shortfallRows = rows.filter((r) => isResourceFieldShortage(r));
  const display = shortfallRows.length > 0 ? shortfallRows : rows;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center space-y-2" data-testid="resource-field-empty">
        <p className="font-semibold">No hay líneas APU para esta obra.</p>
        <p className="text-sm text-muted-foreground">
          Aprobá un presupuesto con APU de este tipo para ver la cobertura.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="resource-field-view">
      <p className="text-xs text-muted-foreground">
        {shortfallRows.length > 0
          ? `${shortfallRows.length} con faltante · ${rows.length} en total`
          : `${rows.length} líneas · sin faltantes`}
      </p>
      <ul className="space-y-2">
        {display.map((row) => {
          const showPedir = canShowResourcePedir(canRequest, row);
          const showInvoice = canShowResourceInvoice(canInvoice, row);
          const detailHref = controlCostosItemHref(projectId, row.wbsNodeId, { budgetId });
          return (
            <li key={row.rowKey}>
              <Card>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <a
                        href={detailHref}
                        className="font-mono text-xs text-primary hover:underline"
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
                      <p className="truncate text-sm font-medium" title={row.description}>
                        {row.description}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{row.wbsName}</p>
                    </div>
                    {isResourceFieldShortage(row) ? (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        Faltante
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Necesidad</p>
                      <p className="font-mono tabular-nums">{formatQtyFromString(row.needQty)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Pedido</p>
                      <p className="font-mono tabular-nums">{formatQtyFromString(row.orderedQty)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Facturado</p>
                      <p className="font-mono tabular-nums">{formatQtyFromString(row.invoicedQty)}</p>
                    </div>
                  </div>
                  {(showPedir || showInvoice) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {showPedir ? (
                        <Button asChild size="sm" className="min-h-11 flex-1">
                          <Link href={resourceFieldPedirHref(projectId, row, costCategory)}>
                            {resourcePedirCtaLabel(row)}
                          </Link>
                        </Button>
                      ) : null}
                      {showInvoice ? (
                        <Button asChild size="sm" variant="outline" className="min-h-11 flex-1">
                          <Link href={resourceInvoiceHref(projectId, row, costCategory)}>
                            Factura
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

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
