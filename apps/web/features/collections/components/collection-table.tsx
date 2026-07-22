import Link from "next/link";
import { formatDate } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { CollectionStatusBadge } from "./collection-status-badge";
import type { CollectionListItem } from "./collection-list";
import { formatMoneyAmount } from "@/lib/format-money";

export function CollectionTable({
  collections,
  projectId,
}: {
  collections: CollectionListItem[];
  projectId: string;
}) {
  if (collections.length === 0) {
    return <ListEmptyState message="Sin cobranzas registradas para este proyecto." />;
  }

  return (
    <TableScroll>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Cuenta</TableHead>
            <TableHead>Moneda</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Notas</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {collections.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="text-sm">{formatDate(c.collectionDate)}</TableCell>
              <TableCell className="text-sm">{c.accountName}</TableCell>
              <TableCell className="text-sm">{c.currency}</TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums">
                {formatMoneyAmount(c.amount)}
              </TableCell>
              <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">
                {c.notes ?? "—"}
              </TableCell>
              <TableCell>
                <CollectionStatusBadge status={c.status} />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/proyectos/${projectId}/cobranzas/${c.id}`}>Ver</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
