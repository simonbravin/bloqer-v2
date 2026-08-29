"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ProjectSupplierReportRow } from "@bloqer/services";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { useClientTableSort } from "@/hooks/use-client-table-sort";
import { formatMoneyAmount, isPositiveMoneyAmount } from "@/lib/format-money";

type Props = {
  rows: ProjectSupplierReportRow[];
};

function formatIsoDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function ProjectSupplierTable({ rows }: Props) {
  const accessors = useMemo(
    () => ({
      name: (r: ProjectSupplierReportRow) => r.supplierName,
      poCount: (r: ProjectSupplierReportRow) => r.poCount,
      invoiceCount: (r: ProjectSupplierReportRow) => r.invoiceCount,
      receiptCount: (r: ProjectSupplierReportRow) => r.receiptCount,
      committedCost: (r: ProjectSupplierReportRow) => r.committedCost,
      accruedCost: (r: ProjectSupplierReportRow) => r.accruedCost,
      paidCost: (r: ProjectSupplierReportRow) => r.paidCost,
      openCommitted: (r: ProjectSupplierReportRow) => r.openCommitted,
      expectedExposure: (r: ProjectSupplierReportRow) => r.expectedExposure,
      share: (r: ProjectSupplierReportRow) => r.shareOfExposurePct ?? "",
      payableBalance: (r: ProjectSupplierReportRow) => r.payableBalance,
      lastActivity: (r: ProjectSupplierReportRow) => r.lastActivityDate ?? "",
    }),
    [],
  );

  const { sorted, sortKey, sortDir, toggleSort } = useClientTableSort(rows, accessors);

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay proveedores con OC, facturas o CxP en este recorte.
      </p>
    );
  }

  return (
    <TableScroll>
      <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-muted/50">
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <SortableTableHead
              label="Proveedor"
              sortKey="name"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortableTableHead
              label="Pedidos"
              sortKey="poCount"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="text-right"
            />
            <SortableTableHead
              label="Facturas"
              sortKey="invoiceCount"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="text-right"
            />
            <SortableTableHead
              label="Recepciones"
              sortKey="receiptCount"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="text-right"
            />
            <SortableTableHead
              label="Comprometido"
              sortKey="committedCost"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="text-right"
            />
            <SortableTableHead
              label="Devengado"
              sortKey="accruedCost"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="text-right"
            />
            <SortableTableHead
              label="Pagado"
              sortKey="paidCost"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="text-right"
            />
            <SortableTableHead
              label="OC abierta"
              sortKey="openCommitted"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="text-right"
            />
            <SortableTableHead
              label="Exposición"
              sortKey="expectedExposure"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="text-right"
            />
            <SortableTableHead
              label="% obra"
              sortKey="share"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="text-right"
            />
            <SortableTableHead
              label="Saldo CxP"
              sortKey="payableBalance"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="text-right"
            />
            <SortableTableHead
              label="Última act."
              sortKey="lastActivity"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row, i) => (
            <TableRow key={row.supplierContactId}>
              <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="max-w-[min(16rem,36vw)] truncate font-medium" title={row.supplierName}>
                <Link href={`/directorio/${row.supplierContactId}`} className="hover:underline">
                  {row.supplierName}
                </Link>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {row.poCount}
                {row.openPoCount > 0 ? (
                  <span className="ml-1 text-muted-foreground">({row.openPoCount} ab.)</span>
                ) : null}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{row.invoiceCount}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{row.receiptCount}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatMoneyAmount(row.committedCost)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatMoneyAmount(row.accruedCost)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatMoneyAmount(row.paidCost)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatMoneyAmount(row.openCommitted)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums font-medium">
                {formatMoneyAmount(row.expectedExposure)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {row.shareOfExposurePct ? `${row.shareOfExposurePct}%` : "—"}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatMoneyAmount(row.payableBalance)}
                {isPositiveMoneyAmount(row.overduePayable) ? (
                  <span className="mt-0.5 block text-[10px] text-destructive">
                    venc. {formatMoneyAmount(row.overduePayable)}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatIsoDate(row.lastActivityDate)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
