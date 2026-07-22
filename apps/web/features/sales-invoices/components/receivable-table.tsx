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
import { ObligationSettledCell } from "@/features/finance/components/obligation-settled-cell";
import { ReceivableStatusBadge } from "./receivable-status-badge";
import {
  receivableDetailHref,
  receivableInvoiceHref,
  type ReceivableListItem,
} from "./receivable-list";
import { formatMoneyAmount } from "@/lib/format-money";

type Props = {
  receivables: ReceivableListItem[];
  /** Muestra columna de obra (listado empresa). */
  showProjectColumn?: boolean;
  invoicesHref?: string;
  invoicesActionLabel?: string;
};

export function ReceivableTable({
  receivables,
  showProjectColumn = false,
  invoicesHref,
  invoicesActionLabel = "Ir a facturas",
}: Props) {
  if (receivables.length === 0) {
    return (
      <ListEmptyState
        title="Sin cuentas por cobrar"
        description="Se crean automáticamente al emitir una factura de venta."
        action={
          invoicesHref ? (
            <Button asChild size="sm" variant="outline">
              <Link href={invoicesHref}>{invoicesActionLabel}</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <TableScroll stickyFirstColumn>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            {showProjectColumn ? <TableHead>Proyecto</TableHead> : null}
            <TableHead>Vencimiento</TableHead>
            {showProjectColumn ? <TableHead>Factura</TableHead> : null}
            <TableHead>Cobrada</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Original</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {receivables.map((r) => {
            const invoiceHref = receivableInvoiceHref(r);
            return (
              <TableRow key={r.id}>
                <TableCell className="text-sm font-medium">{r.clientName}</TableCell>
                {showProjectColumn ? (
                  <TableCell className="text-sm text-muted-foreground">
                    {r.projectCode && r.projectCode !== "—" ? (
                      <span title={r.projectName}>
                        {r.projectCode}
                        {r.projectName ? ` · ${r.projectName}` : ""}
                      </span>
                    ) : (
                      r.projectName ?? "Empresa"
                    )}
                  </TableCell>
                ) : null}
                <TableCell className="text-sm">{formatDate(r.dueDate)}</TableCell>
                {showProjectColumn ? (
                  <TableCell className="text-sm text-muted-foreground">
                    {r.salesInvoiceCode && invoiceHref ? (
                      <Link href={invoiceHref} className="hover:underline">
                        {r.salesInvoiceCode}
                      </Link>
                    ) : (
                      r.salesInvoiceCode ?? "—"
                    )}
                  </TableCell>
                ) : null}
                <TableCell>
                  <ObligationSettledCell status={r.status} balanceDue={r.balanceDue} />
                </TableCell>
                <TableCell>
                  <ReceivableStatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatMoneyAmount(r.originalAmount)} {r.currency}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatMoneyAmount(r.balanceDue)} {r.currency}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={receivableDetailHref(r)}>Ver</Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
