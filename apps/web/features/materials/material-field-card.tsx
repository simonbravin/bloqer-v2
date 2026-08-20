"use client";

import Link from "next/link";
import type { MaterialsFieldRow } from "@bloqer/services/materials-field";
import {
  canShowMaterialsFieldPedir,
  isMaterialsFieldCovered,
  isMaterialsFieldPendingReceipt,
  isMaterialsFieldShortage,
  MATERIALS_FIELD_SUPPLY_LABELS,
  materialsFieldPedirHref,
  materialsFieldSupplyLabel,
} from "@bloqer/services/materials-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateRangeShortAr } from "@/lib/gantt-date-format";
import { cn } from "@/lib/utils";
import { formatMaterialsFieldQty, formatMaterialsFieldQtyWithUnit } from "./materials-field-format";

function supplyBadgeVariant(
  label: ReturnType<typeof materialsFieldSupplyLabel>,
): "default" | "secondary" | "destructive" | "outline" {
  if (label === "sin_pedir") return "outline";
  if (label === "parcial") return "secondary";
  if (label === "recibido") return "default";
  return "secondary";
}

export function MaterialFieldCard({
  projectId,
  row,
  canRequest,
  onSelect,
}: {
  projectId: string;
  row: MaterialsFieldRow;
  canRequest: boolean;
  onSelect: (row: MaterialsFieldRow) => void;
}) {
  const shortage = isMaterialsFieldShortage(row);
  const covered = isMaterialsFieldCovered(row);
  const supply = materialsFieldSupplyLabel(row);
  const showPedir = canShowMaterialsFieldPedir(canRequest, row);
  const dates = formatDateRangeShortAr(row.requiredStart, row.requiredEnd);
  const unit = row.unit;

  return (
    <div
      className={cn(
        "w-full rounded-lg border bg-card p-4 text-left",
        shortage && "border-amber-500/50",
      )}
      data-testid="materials-field-card"
      data-row-key={row.rowKey}
    >
      <button
        type="button"
        onClick={() => onSelect(row)}
        className="w-full text-left min-h-11"
        data-testid="materials-field-card-open"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-snug">{row.description}</h3>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {shortage ? (
              <Badge variant="destructive">Faltante</Badge>
            ) : covered ? (
              <Badge variant="secondary">Cubierto</Badge>
            ) : null}
            <Badge variant={supplyBadgeVariant(supply)}>
              {MATERIALS_FIELD_SUPPLY_LABELS[supply]}
            </Badge>
          </div>
        </div>
        {unit ? <p className="mt-1 text-xs text-muted-foreground">{unit}</p> : null}
        <p className="mt-2 text-xs text-muted-foreground">
          EDT {row.wbsCode} · {row.wbsName}
        </p>
        <p className="mt-1 text-sm tabular-nums">{row.unscheduled ? "Sin fecha" : dates}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Necesario</dt>
            <dd className="font-medium tabular-nums">{formatMaterialsFieldQtyWithUnit(row.needQty, unit)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Pedido</dt>
            <dd className="tabular-nums">{formatMaterialsFieldQtyWithUnit(row.orderedQty, unit)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Recibido</dt>
            <dd className="tabular-nums">{formatMaterialsFieldQtyWithUnit(row.receivedQty, unit)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Faltante</dt>
            <dd
              className={cn(
                "font-semibold tabular-nums",
                shortage && "text-amber-700 dark:text-amber-400",
              )}
            >
              {formatMaterialsFieldQtyWithUnit(row.shortfallQty, unit)}
            </dd>
          </div>
        </dl>
        {isMaterialsFieldPendingReceipt(row) ? (
          <p className="mt-2 text-sm">
            Por recibir:{" "}
            <span className="font-medium tabular-nums">
              {formatMaterialsFieldQty(row.pendingReceiptQty)}
              {unit ? ` ${unit}` : ""}
            </span>
          </p>
        ) : null}
      </button>
      {showPedir ? (
        <Button asChild className="mt-3 min-h-11 w-full" size="sm">
          <Link
            href={materialsFieldPedirHref(projectId, row)}
            data-testid="materials-field-pedir"
            onClick={(e) => e.stopPropagation()}
          >
            Pedir
          </Link>
        </Button>
      ) : null}
      {canRequest && row.relatedPurchaseRequestId ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground" data-testid="materials-field-request-created">
            Solicitud creada
            {row.relatedPurchaseRequestNumber != null
              ? ` · #${row.relatedPurchaseRequestNumber}`
              : ""}
          </p>
          <Button asChild variant="outline" className="min-h-11 w-full" size="sm">
            <Link
              href={`/proyectos/${projectId}/solicitudes-compra/${row.relatedPurchaseRequestId}`}
              data-testid="materials-field-ver-solicitud"
              onClick={(e) => e.stopPropagation()}
            >
              Ver solicitud
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
