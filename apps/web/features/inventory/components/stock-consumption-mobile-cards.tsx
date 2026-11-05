import type { StockMovementView } from "@bloqer/services";
import { formatDate } from "@/lib/format";
import { formatQtyFromString, formatUnitPriceFromString } from "@/lib/format-money";
import { StockMovementAccountingButton } from "@/features/accounting";
import { STOCK_MOVEMENT_STATUS_LABELS } from "../lib/stock-movement-ui";
import { StockMovementTypeBadge } from "./stock-movement-type-badge";

export function StockConsumptionMobileCards({
  movements,
  accountingReturnPath,
  canEditAccounting,
}: {
  movements: StockMovementView[];
  accountingReturnPath?: string;
  canEditAccounting?: boolean;
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
            {formatQtyFromString(m.quantity)} {m.productUnit}
            <span className="text-muted-foreground"> · {m.warehouseName}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {STOCK_MOVEMENT_STATUS_LABELS[m.status] ?? m.status}
          </p>
          {m.unitCost != null ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Costo unitario informado: {formatUnitPriceFromString(m.unitCost)} {m.costCurrency}
            </p>
          ) : null}
          {m.costWarning ? (
            <p className="mt-1 text-xs text-muted-foreground">{m.costWarning}</p>
          ) : null}
          {canEditAccounting && accountingReturnPath && m.canGenerateAccountingDraft ? (
            <StockMovementAccountingButton
              stockMovementId={m.id}
              returnPath={accountingReturnPath}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
