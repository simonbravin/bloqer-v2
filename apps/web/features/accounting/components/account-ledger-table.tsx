import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import type { AccountLedgerRowView } from "@bloqer/services";
import { formatMoneyAmount, isZeroMoneyAmount } from "@/lib/format-money";

export function AccountLedgerTable({
  rows,
  truncated,
}: {
  rows: AccountLedgerRowView[];
  truncated?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin movimientos contabilizados en esta cuenta.</p>;
  }
  return (
    <div className="space-y-2">
      {truncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Se muestran las primeras filas del período. Exportá CSV/PDF para el detalle completo o acotá el rango.
        </p>
      ) : null}
      <TableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Asiento</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Debe</TableHead>
              <TableHead className="text-right">Haber</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Moneda</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={r.isOpening ? "bg-muted/40" : undefined}>
                <TableCell className="font-mono text-sm whitespace-nowrap">{r.entryDate}</TableCell>
                <TableCell className="font-mono text-xs">
                  {r.isOpening || !r.entryId ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <Link
                      href={`/contabilidad/asientos/${r.entryId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {r.entryReference ?? `${r.entryId.slice(0, 8)}…`}
                    </Link>
                  )}
                </TableCell>
                <TableCell
                  className={`max-w-[280px] truncate text-sm ${r.isOpening ? "italic text-muted-foreground" : ""}`}
                  title={r.entryDescription}
                >
                  {r.entryDescription}
                  {r.lineDescription ? ` — ${r.lineDescription}` : ""}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {r.isOpening || isZeroMoneyAmount(r.debit) ? "—" : formatMoneyAmount(r.debit)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {r.isOpening || isZeroMoneyAmount(r.credit) ? "—" : formatMoneyAmount(r.credit)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">
                  {formatMoneyAmount(r.runningBalance)}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{r.currency}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableScroll>
    </div>
  );
}
