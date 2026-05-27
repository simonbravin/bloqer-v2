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
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";

function formatAmount(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

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
                <TableCell className="font-medium">{p.supplierName}</TableCell>
                <TableCell className="text-muted-foreground">#{p.supplierInvoiceNumber}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{p.accountName}</TableCell>
                <TableCell className="text-right tabular-nums font-mono text-red-600 dark:text-red-400">
                  {formatAmount(p.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
    </TableScroll>
  );
}
