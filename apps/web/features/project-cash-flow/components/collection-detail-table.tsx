import { formatCurrencyDisplay, formatDate } from "@/lib/format";
import type { CollectionDetail } from "@bloqer/services";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";

function formatAmount(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

interface Props {
  collections: CollectionDetail[];
  currency: string;
}

export function CollectionDetailTable({ collections, currency }: Props) {
  if (collections.length === 0) {
    return <ListEmptyState message="Sin cobranzas confirmadas en el período seleccionado." />;
  }

  const currencyLabel = formatCurrencyDisplay(currency);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <TableScroll className="border-0 rounded-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Factura</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead className="text-right">Monto ({currencyLabel})</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {collections.map((c) => (
              <TableRow key={c.collectionId}>
                <TableCell className="whitespace-nowrap">{formatDate(c.date)}</TableCell>
                <TableCell className="font-medium">{c.clientName}</TableCell>
                <TableCell className="text-muted-foreground">#{c.invoiceNumber}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{c.accountName}</TableCell>
                <TableCell className="text-right tabular-nums font-mono text-emerald-600 dark:text-emerald-400">
                  {formatAmount(c.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableScroll>
    </div>
  );
}
