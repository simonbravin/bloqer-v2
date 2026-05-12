import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { AccountingMappingRuleView } from "@bloqer/services";
import { AccountingEventTypeBadge } from "./accounting-event-type-badge";

export function AccountingMappingRuleList({
  rules,
  empresa,
}: {
  rules: AccountingMappingRuleView[];
  empresa?: string;
}) {
  const q = empresa ? `?empresa=${encodeURIComponent(empresa)}` : "";
  if (rules.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay reglas contables.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Evento</TableHead>
          <TableHead>Nombre</TableHead>
          <TableHead>Debe</TableHead>
          <TableHead>Haber</TableHead>
          <TableHead className="text-right">Prioridad</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((r) => (
          <TableRow key={r.id}>
            <TableCell><AccountingEventTypeBadge eventType={r.eventType} /></TableCell>
            <TableCell>
              <Link className="text-primary underline-offset-4 hover:underline" href={`/contabilidad/reglas/${r.id}${q}`}>
                {r.name}
              </Link>
            </TableCell>
            <TableCell className="font-mono text-xs">{r.debitAccountCode}</TableCell>
            <TableCell className="font-mono text-xs">{r.creditAccountCode}</TableCell>
            <TableCell className="text-right text-muted-foreground text-sm">{r.priority}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{r.isActive ? "Activa" : "Inactiva"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
