"use client";

import type { ScheduleWorkspaceItemDto } from "@bloqer/services";
import { formatGroupedDecimal } from "@bloqer/utils";
import { Button } from "@/components/ui/button";
import { formatDateAr } from "@/lib/gantt-date-format";
import { ScheduleProcurementChips } from "./schedule-procurement-chips";

export function ScheduleProcurementDetails({ projectId, procurement }: {
  projectId: string;
  procurement: ScheduleWorkspaceItemDto["procurement"] | undefined;
}) {
  if (!procurement) return null;
  return (
    <section aria-label="Abastecimiento de la tarea" className="min-w-0 space-y-3 rounded-lg border p-3">
      <h3 className="font-medium">Abastecimiento</h3>
      <ScheduleProcurementChips item={{ procurement }} className="flex flex-wrap items-center gap-2 [&_span]:text-xs" />
      <p className="text-xs text-muted-foreground">OC abiertas vinculadas a la EDT. La última recepción puede ser parcial; no acredita abastecimiento completo.</p>
      {procurement.incompleteSources ? <p className="text-sm text-amber-800 dark:text-amber-300">Hay vínculos inconsistentes. Revisá los documentos antes de interpretar cantidades o fechas; la información es parcial.</p> : null}
      {procurement.pendingLines == null ? <p className="text-sm text-muted-foreground">Las cantidades y las OC requieren permiso para consultar órdenes de compra.</p> : procurement.pendingLines.length > 0 ? (
        <ul className="space-y-3">
          {procurement.pendingLines.map((line) => (
            <li key={line.id} className="min-w-0 space-y-1 border-t pt-3 text-sm">
              <p className="break-words font-medium">{line.description}</p>
              <p className="text-xs text-muted-foreground">EDT {line.wbsCode} · Entrega prevista: {line.expectedDeliveryDate ? formatDateAr(line.expectedDeliveryDate) : "Sin fecha"}</p>
              <p className="break-words tabular-nums">Pedido {formatGroupedDecimal(line.quantity, 4)} {line.unit} · Recibido {formatGroupedDecimal(line.receivedQuantity, 4)} {line.unit}</p>
              <p className="break-words font-medium tabular-nums">Pendiente {formatGroupedDecimal(line.remainingQuantity, 4)} {line.unit}</p>
              <Button variant="outline" size="sm" className="min-h-11" asChild>
                <a href={`/proyectos/${projectId}/ordenes-compra/${line.purchaseOrderId}`}>Abrir {line.purchaseOrderCode}</a>
              </Button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">{procurement.incompleteSources ? "No se pudieron comprobar todas las cantidades pendientes." : "Sin cantidades pendientes en las OC abiertas de estas partidas."}</p>}
    </section>
  );
}
