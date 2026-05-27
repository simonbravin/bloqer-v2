"use client";

import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { InternalTransferView } from "@bloqer/services";
import { CancelInternalTransferButton } from "./cancel-internal-transfer-button";

function fmtMoney(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(parseFloat(value)) +
    " " +
    currency
  );
}

export function InternalTransferCards({ transfers }: { transfers: InternalTransferView[] }) {
  if (transfers.length === 0) {
    return <ListEmptyState message="Sin transferencias registradas." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {transfers.map((t) => (
        <div key={t.id} className="flex flex-col rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs text-muted-foreground">{formatDate(t.transferDate)}</span>
            <Badge variant={t.status === "CONFIRMED" ? "default" : "secondary"}>
              {t.status === "CONFIRMED" ? "Confirmada" : "Cancelada"}
            </Badge>
          </div>
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Origen:</span> {t.sourceAccountName}
          </p>
          <p className="mt-1 text-sm">
            <span className="text-muted-foreground">Destino:</span> {t.destinationAccountName}
          </p>
          <p className="mt-3 text-lg font-semibold tabular-nums">{fmtMoney(t.amount, t.currency)}</p>
          {t.status === "CONFIRMED" ? (
            <div className="mt-3">
              <CancelInternalTransferButton transferId={t.id} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
