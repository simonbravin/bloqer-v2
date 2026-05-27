"use client";

import { useState } from "react";
import type { AgingReport, AgingRow, AgingItem } from "@bloqer/services";
import { formatCurrencyDisplay, formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { AgingBucketBadge } from "./aging-bucket-badge";

interface Props {
  report: AgingReport;
  linkBase?: string;
}

function formatAmount(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierta",
  PARTIAL: "Parcial",
  OVERDUE: "Vencida",
  PAID: "Pagada",
  CANCELLED: "Cancelada",
};

function ItemRows({ items }: { items: AgingItem[] }) {
  return (
    <TableRow>
      <TableCell colSpan={8} className="p-0">
        <TableScroll className="border-0 rounded-none">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="font-normal">Factura</TableHead>
                <TableHead className="font-normal">Proyecto</TableHead>
                <TableHead className="font-normal">Emisión</TableHead>
                <TableHead className="font-normal">Vencimiento</TableHead>
                <TableHead className="text-right font-normal">Original</TableHead>
                <TableHead className="text-right font-normal">Pagado</TableHead>
                <TableHead className="text-right font-normal">Saldo</TableHead>
                <TableHead className="font-normal">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/20">
                  <TableCell className="font-mono">#{item.invoiceNumber}</TableCell>
                  <TableCell className="max-w-[160px] truncate">{item.projectName || "—"}</TableCell>
                  <TableCell>{formatDate(item.issueDate)}</TableCell>
                  <TableCell>
                    <span>{formatDate(item.dueDate)}</span>
                    {item.daysOverdue > 0 && (
                      <span className="ml-1 text-red-500">({item.daysOverdue}d)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(item.originalAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatAmount(item.paidAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatAmount(item.balanceDue)}
                  </TableCell>
                  <TableCell>
                    <AgingBucketBadge bucket={item.bucket} />
                    <span className="ml-1 text-muted-foreground">
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      </TableCell>
    </TableRow>
  );
}

function GroupRow({
  row,
  expanded,
  onToggle,
}: {
  row: AgingRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasItems = row.items.length > 0;
  return (
    <>
      <TableRow className="cursor-pointer select-none" onClick={onToggle}>
        <TableCell className="font-medium">
          <span className="mr-2 text-muted-foreground">{expanded ? "▾" : "▸"}</span>
          {row.contactName}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {formatCurrencyDisplay(row.currency)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
          {parseFloat(row.current) > 0 ? formatAmount(row.current) : "—"}
        </TableCell>
        <TableCell className="text-right tabular-nums text-yellow-700 dark:text-yellow-400">
          {parseFloat(row.bucket1_30) > 0 ? formatAmount(row.bucket1_30) : "—"}
        </TableCell>
        <TableCell className="text-right tabular-nums text-orange-700 dark:text-orange-400">
          {parseFloat(row.bucket31_60) > 0 ? formatAmount(row.bucket31_60) : "—"}
        </TableCell>
        <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
          {parseFloat(row.bucket61_90) > 0 ? formatAmount(row.bucket61_90) : "—"}
        </TableCell>
        <TableCell className="text-right tabular-nums text-red-700 dark:text-red-300 font-medium">
          {parseFloat(row.bucket90Plus) > 0 ? formatAmount(row.bucket90Plus) : "—"}
        </TableCell>
        <TableCell className="text-right tabular-nums font-semibold">
          {formatAmount(row.totalBalance)}
        </TableCell>
      </TableRow>
      {expanded && hasItems && <ItemRows items={row.items} />}
    </>
  );
}

export function AgingTable({ report }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (report.rows.length === 0) {
    return <ListEmptyState message="No hay saldos pendientes con los filtros actuales." />;
  }

  const t = report.totals;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <TableScroll className="border-0 rounded-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente / Proveedor</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead className="text-right text-emerald-600 dark:text-emerald-400">Al día</TableHead>
              <TableHead className="text-right text-yellow-700 dark:text-yellow-400">1–30d</TableHead>
              <TableHead className="text-right text-orange-700 dark:text-orange-400">31–60d</TableHead>
              <TableHead className="text-right text-red-600 dark:text-red-400">61–90d</TableHead>
              <TableHead className="text-right text-red-700 dark:text-red-300">+90d</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.map((row) => {
              const key = `${row.contactId}::${row.currency}`;
              return (
                <GroupRow
                  key={key}
                  row={row}
                  expanded={expanded.has(key)}
                  onToggle={() => toggle(key)}
                />
              );
            })}
          </TableBody>
          <TableFooter className="bg-muted/50 font-semibold">
            <TableRow>
              <TableCell colSpan={2}>Total general</TableCell>
              <TableCell className="text-right tabular-nums">{formatAmount(t.current)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatAmount(t.bucket1_30)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatAmount(t.bucket31_60)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatAmount(t.bucket61_90)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatAmount(t.bucket90Plus)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatAmount(t.totalBalance)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </TableScroll>

      {Object.keys(report.byCurrency).length > 1 && (
        <div className="border-t px-4 py-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Desglose por moneda:</span>
          {Object.entries(report.byCurrency).map(([cur, totals]) => (
            <span key={cur}>
              <span className="font-mono font-medium text-foreground">
                {formatCurrencyDisplay(cur)}
              </span>{" "}
              {formatAmount(totals.totalBalance)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
