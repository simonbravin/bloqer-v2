"use client";

import { Badge } from "@/components/ui/badge";
import { formatDateAr } from "@/lib/gantt-date-format";
import type { ScheduleWorkspaceItemDto } from "@bloqer/services";

/** Chips for OC promised / received dates ([D-104]). */
export function ScheduleProcurementChips({
  item,
  className,
}: {
  item: Pick<ScheduleWorkspaceItemDto, "procurement">;
  className?: string;
}) {
  const p = item.procurement;
  if (!p) return null;
  const hasAny =
    p.expectedDeliveryDate || p.latestReceiptDate || p.deliveryAfterSiblingStart;
  if (!hasAny) return null;

  return (
    <div className={className ?? "flex flex-wrap items-center gap-1"}>
      {p.expectedDeliveryDate ? (
        <Badge
          variant="outline"
          className="text-[10px] px-1 py-0 font-normal"
          title="Fecha prometida de entrega en OC confirmada"
        >
          Entrega OC {formatDateAr(p.expectedDeliveryDate)}
        </Badge>
      ) : null}
      {p.latestReceiptDate ? (
        <Badge
          variant="outline"
          className="text-[10px] px-1 py-0 font-normal text-emerald-700 dark:text-emerald-400"
          title="Última recepción confirmada"
        >
          Recibido {formatDateAr(p.latestReceiptDate)}
        </Badge>
      ) : null}
      {p.deliveryAfterSiblingStart ? (
        <Badge
          variant="outline"
          className="text-[10px] px-1 py-0 font-normal border-amber-500/50 text-amber-800 dark:text-amber-300"
          title="La entrega prometida es posterior al inicio de una tarea hermana con la misma EDT"
        >
          Entrega después del inicio
        </Badge>
      ) : null}
    </div>
  );
}
