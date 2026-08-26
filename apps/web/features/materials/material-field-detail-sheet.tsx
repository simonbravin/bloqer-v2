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
  materialsPedirCtaLabel,
} from "@bloqer/services/materials-field";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDateRangeShortAr } from "@/lib/gantt-date-format";
import { formatMaterialsFieldQtyWithUnit } from "./materials-field-format";

export function MaterialFieldDetailSheet({
  projectId,
  row,
  canRequest,
  open,
  onOpenChange,
}: {
  projectId: string;
  row: MaterialsFieldRow | null;
  canRequest: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shortage = row ? isMaterialsFieldShortage(row) : false;
  const covered = row ? isMaterialsFieldCovered(row) : false;
  const supply = row ? materialsFieldSupplyLabel(row) : "sin_pedir";
  const showPedir = row ? canShowMaterialsFieldPedir(canRequest, row) : false;
  const unit = row?.unit ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        data-testid="materials-field-detail-sheet"
      >
        <SheetHeader>
          <SheetTitle className="pr-8 text-left">{row?.description ?? "Material"}</SheetTitle>
          <SheetDescription className="text-left">
            {row
              ? `${MATERIALS_FIELD_SUPPLY_LABELS[supply]}${shortage ? " · Faltante" : covered ? " · Cubierto" : ""}`
              : "Detalle de material"}
          </SheetDescription>
        </SheetHeader>

        {row ? (
          <div className="mt-4 space-y-4 text-sm">
            <p>
              <span className="text-muted-foreground">EDT</span>
              <br />
              {row.wbsCode} · {row.wbsName}
            </p>
            {row.productSku ? (
              <p>
                <span className="text-muted-foreground">SKU</span>
                <br />
                {row.productSku}
              </p>
            ) : null}
            <p>
              <span className="text-muted-foreground">Fecha</span>
              <br />
              {row.unscheduled
                ? "Sin fecha de cronograma"
                : formatDateRangeShortAr(row.requiredStart, row.requiredEnd)}
            </p>
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Necesario</dt>
                <dd className="font-medium tabular-nums">
                  {formatMaterialsFieldQtyWithUnit(row.needQty, unit)}
                </dd>
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
                <dd className="font-semibold tabular-nums">
                  {formatMaterialsFieldQtyWithUnit(row.shortfallQty, unit)}
                </dd>
              </div>
            </dl>
            {isMaterialsFieldPendingReceipt(row) ? (
              <p>
                <span className="text-muted-foreground">Por recibir</span>
                <br />
                {formatMaterialsFieldQtyWithUnit(row.pendingReceiptQty, unit)}
              </p>
            ) : null}
            {row.relatedPurchaseRequestId ? (
              <p>
                <span className="text-muted-foreground">Solicitud</span>
                <br />
                #{row.relatedPurchaseRequestNumber ?? "—"}
              </p>
            ) : null}
            {row.relatedPurchaseOrderId ? (
              <p>
                <span className="text-muted-foreground">Orden de compra</span>
                <br />
                #{row.relatedPurchaseOrderNumber ?? "—"}
              </p>
            ) : null}
            {!row.relatedPurchaseRequestId && !row.relatedPurchaseOrderId ? (
              <p className="text-muted-foreground">Sin solicitud vinculada de forma inequívoca.</p>
            ) : null}

            <div className="flex flex-col gap-2 pt-2">
              {showPedir ? (
                <Button asChild className="min-h-11 w-full">
                  <Link href={materialsFieldPedirHref(projectId, row)} data-testid="materials-field-sheet-pedir">
                    {materialsPedirCtaLabel(row)}
                  </Link>
                </Button>
              ) : null}
              {row.relatedPurchaseRequestId ? (
                <Button asChild variant="outline" className="min-h-11 w-full">
                  <Link href={`/proyectos/${projectId}/solicitudes-compra/${row.relatedPurchaseRequestId}`} data-testid="materials-field-sheet-ver-solicitud">
                    Ver solicitud
                  </Link>
                </Button>
              ) : null}
              {row.relatedPurchaseOrderId ? (
                <Button asChild variant="outline" className="min-h-11 w-full">
                  <Link
                    href={`/proyectos/${projectId}/ordenes-compra/${row.relatedPurchaseOrderId}`}
                    data-testid="materials-field-sheet-ver-oc"
                  >
                    Ver OC
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
