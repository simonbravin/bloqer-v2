"use client";

import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { InternalTransferView } from "@bloqer/services";
import { formatGroupedDecimal } from "@bloqer/utils";
import { formatMoneyAmount } from "@/lib/format-money";
import { CancelInternalTransferButton } from "./cancel-internal-transfer-button";

export function InternalTransferCards({ transfers, canCancel }: { transfers: InternalTransferView[]; canCancel: boolean }) {
  if (transfers.length === 0) {
    return <ListEmptyState message="Sin transferencias registradas." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {transfers.map((t) => (
        <div key={t.id} className="flex flex-col rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs text-muted-foreground">Contable {formatDate(t.transferDate)}</span>
            <Badge variant={t.status === "CONFIRMED" ? "default" : "secondary"}>
              {t.status === "CONFIRMED" ? "Confirmada" : "Cancelada"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Fecha valor {t.valueDate == null ? "sin registrar" : formatDate(t.valueDate)}</p>
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Origen:</span> {t.sourceAccountName}
          </p>
          <p className="mt-1 text-sm">
            <span className="text-muted-foreground">Destino:</span> {t.destinationAccountName}
          </p>
          <p className="mt-3 text-lg font-semibold tabular-nums">
            {formatMoneyAmount(t.amount)} {t.currency}
          </p>
          {t.currency !== "ARS" ? (
            <p className="text-xs text-muted-foreground">
              {t.amountArs == null || t.fxRate == null
                ? "Equivalente histórico ARS no disponible"
                : `Equivalente histórico: ${formatMoneyAmount(t.amountArs, "ARS")} · ${formatGroupedDecimal(t.fxRate, 6)} ARS por ${t.currency}`}
            </p>
          ) : null}
          {canCancel && t.status === "CONFIRMED" ? (
            <div className="mt-3">
              <CancelInternalTransferButton transferId={t.id} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
