import Link from "next/link";
import { formatDate } from "@/lib/format";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { JournalEntryView } from "@bloqer/services";
import { JournalEntryStatusBadge } from "./journal-entry-status-badge";

export function JournalEntryList({
  entries,
  empresa,
}: {
  entries: JournalEntryView[];
  empresa?: string;
}) {
  const q = empresa ? `?empresa=${encodeURIComponent(empresa)}` : "";
  if (entries.length === 0) {
    return <ListEmptyState message="No hay asientos." />;
  }
  return (
    <div className="rounded-lg border">
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Descripción</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Líneas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="whitespace-nowrap font-mono text-sm">
              {formatDate(e.entryDate)}
            </TableCell>
            <TableCell>
              <Link className="text-primary underline-offset-4 hover:underline" href={`/contabilidad/asientos/${e.id}${q}`}>
                {e.description}
              </Link>
            </TableCell>
            <TableCell><JournalEntryStatusBadge status={e.status} /></TableCell>
            <TableCell className="text-right text-muted-foreground text-sm">{e.lines.length}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      </Table>
    </div>
  );
}
