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
import { TableScroll } from "@/components/ui/table-scroll";
import type { InternalTransferView } from "@bloqer/services";
import { formatMoneyAmount } from "@/lib/format-money";
import { CancelInternalTransferButton } from "./cancel-internal-transfer-button";

export function InternalTransferTable({ transfers }: { transfers: InternalTransferView[] }) {
  if (transfers.length === 0) {
    return <ListEmptyState message="Sin transferencias registradas." />;
  }

  return (
    <TableScroll>
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
                {formatMoneyAmount(t.amount)} {t.currency}
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
    </TableScroll>
  );
}
