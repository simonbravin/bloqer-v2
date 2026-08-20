import type { StockMovementView } from "@bloqer/services";
import { formatDate } from "@/lib/format";
import { formatQtyFromString } from "@/lib/format-money";
import { StockMovementTypeBadge } from "./stock-movement-type-badge";

export function StockConsumptionMobileCards({
  movements,
}: {
  movements: StockMovementView[];
}) {
  return (
    <ul className="space-y-3 md:hidden">
      {movements.map((m) => (
        <li key={m.id} className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium tabular-nums">{formatDate(m.movementDate)}</p>
            <StockMovementTypeBadge type={m.type} />
          </div>
          <p className="mt-1 text-sm">{m.productName}</p>
          <p className="mt-1 text-sm tabular-nums">
            {formatQtyFromString(m.quantity)}
            <span className="text-muted-foreground"> · {m.warehouseName}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.status === "CONFIRMED" ? "Confirmado" : "Anulado"}
          </p>
        </li>
      ))}
    </ul>
  );
}
