import { formatCurrencyDisplay, formatDate } from "@/lib/format";
import type { PaymentDetail } from "@bloqer/services";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableNameCellClass,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatMoneyAmount } from "@/lib/format-money";

interface Props {
  payments: PaymentDetail[];
  currency: string;
}

export function PaymentDetailTable({ payments, currency }: Props) {
  if (payments.length === 0) {
    return <ListEmptyState message="Sin pagos confirmados en el período seleccionado." />;
  }

  const currencyLabel = formatCurrencyDisplay(currency);

  return (
    <TableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Factura</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead className="text-right">Monto ({currencyLabel})</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.paymentId}>
                <TableCell className="whitespace-nowrap">{formatDate(p.date)}</TableCell>
                <TableCell className={cn(tableNameCellClass, "font-medium")} title={p.supplierName}>
                  {p.supplierName}
                </TableCell>
                <TableCell className="text-muted-foreground">#{p.supplierInvoiceNumber}</TableCell>
                <TableCell
                  className="max-w-[10rem] truncate text-muted-foreground text-xs"
                  title={p.accountName}
                >
                  {p.accountName}
                </TableCell>
                <TableCell className="text-right tabular-nums font-mono text-red-600 dark:text-red-400">
                  {formatMoneyAmount(p.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
    </TableScroll>
  );
}
