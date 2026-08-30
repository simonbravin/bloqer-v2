import Link from "next/link";
import { Suspense } from "react";
import { formatDate } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableStickyNameCellClass,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { UrlSortableTableHead } from "@/components/ui/url-sortable-table-head";
import { ObligationSettledCell } from "@/features/finance/components/obligation-settled-cell";
import { DocumentClassBadge } from "@/features/finance/components/document-class-badge";
import { ReceivableStatusBadge } from "./receivable-status-badge";
import {
  receivableDetailHref,
  receivableCollectHref,
  receivableInvoiceHref,
  type ReceivableListItem,
} from "./receivable-list";
import { formatMoneyAmount } from "@/lib/format-money";

const COLLECTABLE = new Set(["OPEN", "PARTIAL", "OVERDUE"]);

type Props = {
  receivables: ReceivableListItem[];
  /** Muestra columna de obra (listado empresa). */
  showProjectColumn?: boolean;
  /** Muestra columna FAC-xxxxx. */
  showInvoiceColumn?: boolean;
  /** EDIT AR: muestra botón Cobrar. */
  canMutate?: boolean;
  invoicesHref?: string;
  invoicesActionLabel?: string;
};

export function ReceivableTable({
  receivables,
  showProjectColumn = false,
  showInvoiceColumn = false,
  canMutate = false,
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
            <Suspense fallback={<TableHead>Vencimiento</TableHead>}>
              <UrlSortableTableHead label="Vencimiento" defaultDir="asc" />
            </Suspense>
            {showInvoiceColumn ? <TableHead>Factura</TableHead> : null}
            <TableHead>Clase</TableHead>
            <TableHead>Cobrada</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Original</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead className="w-36" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {receivables.map((r) => {
            const invoiceHref = receivableInvoiceHref(r);
            const canCollect = canMutate && COLLECTABLE.has(r.status);
            return (
              <TableRow key={r.id}>
                <TableCell
                  className={cn(tableStickyNameCellClass, "font-medium")}
                  title={r.clientName}
                >
                  {r.clientName}
                </TableCell>
                {showProjectColumn ? (
                  <TableCell
                    className="max-w-[12rem] truncate text-sm text-muted-foreground"
                    title={
                      r.projectCode && r.projectCode !== "—"
                        ? [r.projectCode, r.projectName].filter(Boolean).join(" · ")
                        : (r.projectName ?? "Empresa")
                    }
                  >
                    {r.projectCode && r.projectCode !== "—" ? (
                      <>
                        {r.projectCode}
                        {r.projectName ? ` · ${r.projectName}` : ""}
                      </>
                    ) : (
                      r.projectName ?? "Empresa"
                    )}
                  </TableCell>
                ) : null}
                <TableCell className="text-sm">{formatDate(r.dueDate)}</TableCell>
                {showInvoiceColumn ? (
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
                  {r.classLabel ? (
                    <DocumentClassBadge
                      classLabel={r.classLabel}
                      classFamily={r.classFamily}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
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
                  <div className="flex justify-end gap-1">
                    {canCollect ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={receivableCollectHref(r)}>Cobrar</Link>
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={receivableDetailHref(r)}>Ver</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
