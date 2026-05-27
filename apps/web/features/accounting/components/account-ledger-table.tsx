import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import type { AccountLedgerRowView } from "@bloqer/services";

export function AccountLedgerTable({ rows }: { rows: AccountLedgerRowView[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin movimientos contabilizados en esta cuenta.</p>;
  }
  return (
    <TableScroll>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Asiento</TableHead>
          <TableHead>Descripción</TableHead>
          <TableHead className="text-right">Debe</TableHead>
          <TableHead className="text-right">Haber</TableHead>
          <TableHead>Moneda</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-mono text-sm whitespace-nowrap">{r.entryDate}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{r.entryId.slice(0, 8)}…</TableCell>
            <TableCell className="max-w-[280px] truncate text-sm" title={r.entryDescription}>
              {r.entryDescription}
              {r.lineDescription ? ` — ${r.lineDescription}` : ""}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">{r.debit !== "0" ? r.debit : "—"}</TableCell>
            <TableCell className="text-right font-mono text-sm">{r.credit !== "0" ? r.credit : "—"}</TableCell>
            <TableCell className="text-muted-foreground text-sm">{r.currency}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </TableScroll>
  );
}
