"use client";

import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export function InternalTransferTable({ transfers }: { transfers: InternalTransferView[] }) {
  if (transfers.length === 0) {
    return <ListEmptyState message="Sin transferencias registradas." />;
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Origen</TableHead>
            <TableHead>Destino</TableHead>
            <TableHead>Moneda</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transfers.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="text-sm">{formatDate(t.transferDate)}</TableCell>
              <TableCell className="text-sm">{t.sourceAccountName}</TableCell>
              <TableCell className="text-sm">{t.destinationAccountName}</TableCell>
              <TableCell className="text-sm">{t.currency}</TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums">
                {fmtMoney(t.amount, t.currency)}
              </TableCell>
              <TableCell>
                <Badge variant={t.status === "CONFIRMED" ? "default" : "secondary"}>
                  {t.status === "CONFIRMED" ? "Confirmada" : "Cancelada"}
                </Badge>
              </TableCell>
              <TableCell>
                {t.status === "CONFIRMED" ? <CancelInternalTransferButton transferId={t.id} /> : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
