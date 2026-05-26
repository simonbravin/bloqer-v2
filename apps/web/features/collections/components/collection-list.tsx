import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CollectionStatusBadge } from "./collection-status-badge";
import type { CollectionStatus } from "@bloqer/database";
import { formatDate } from "@/lib/format";

export type CollectionListItem = {
  id: string;
  projectId: string;
  collectionDate: Date;
  accountName: string;
  currency: string;
  amount: string;
  notes: string | null;
  status: CollectionStatus;
};

function fmtMoney(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

interface CollectionListProps {
  collections: CollectionListItem[];
  projectId: string;
}

export function CollectionList({ collections, projectId }: CollectionListProps) {
  if (collections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin cobranzas registradas para este proyecto.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Cuenta</TableHead>
          <TableHead>Moneda</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Notas</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {collections.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="text-sm">{formatDate(c.collectionDate)}</TableCell>
            <TableCell className="text-sm">{c.accountName}</TableCell>
            <TableCell className="text-sm">{c.currency}</TableCell>
            <TableCell className="text-right font-mono text-sm">
              {fmtMoney(c.amount)}
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
  );
}
