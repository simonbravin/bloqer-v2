"use client";

import { useState } from "react";
import type { AgingReport, AgingRow, AgingItem } from "@bloqer/services";
import { AgingBucketBadge } from "./aging-bucket-badge";

interface Props {
  report: AgingReport;
  linkBase?: string; // e.g. "/proyectos/[id]/cuentas-por-cobrar" for drilldown links
}

function fmt(v: string) {
  return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR");
}

const STATUS_LABELS: Record<string, string> = {
  OPEN:      "Abierta",
  PARTIAL:   "Parcial",
  OVERDUE:   "Vencida",
  PAID:      "Pagada",
  CANCELLED: "Cancelada",
};

function ItemRows({ items }: { items: AgingItem[] }) {
  return (
    <tr>
      <td colSpan={8} className="p-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/40 text-muted-foreground">
              <th className="px-4 py-1.5 text-left font-normal">Factura</th>
              <th className="px-4 py-1.5 text-left font-normal">Proyecto</th>
              <th className="px-4 py-1.5 text-left font-normal">Emisión</th>
              <th className="px-4 py-1.5 text-left font-normal">Vencimiento</th>
              <th className="px-4 py-1.5 text-right font-normal">Original</th>
              <th className="px-4 py-1.5 text-right font-normal">Pagado</th>
              <th className="px-4 py-1.5 text-right font-normal">Saldo</th>
              <th className="px-4 py-1.5 text-left font-normal">Estado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="px-4 py-1.5 font-mono">#{item.invoiceNumber}</td>
                <td className="px-4 py-1.5 max-w-[160px] truncate">{item.projectName}</td>
                <td className="px-4 py-1.5">{fmtDate(item.issueDate)}</td>
                <td className="px-4 py-1.5">
                  <span>{fmtDate(item.dueDate)}</span>
                  {item.daysOverdue > 0 && (
                    <span className="ml-1 text-red-500">({item.daysOverdue}d)</span>
                  )}
                </td>
                <td className="px-4 py-1.5 text-right tabular-nums">{fmt(item.originalAmount)}</td>
                <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(item.paidAmount)}</td>
                <td className="px-4 py-1.5 text-right tabular-nums font-medium">{fmt(item.balanceDue)}</td>
                <td className="px-4 py-1.5">
                  <AgingBucketBadge bucket={item.bucket} />
                  <span className="ml-1 text-muted-foreground">{STATUS_LABELS[item.status] ?? item.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

function GroupRow({ row, expanded, onToggle }: { row: AgingRow; expanded: boolean; onToggle: () => void }) {
  const hasItems = row.items.length > 0;
  return (
    <>
      <tr
        className="border-t hover:bg-muted/30 cursor-pointer select-none"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 font-medium">
          <span className="mr-2 text-muted-foreground">{expanded ? "▾" : "▸"}</span>
          {row.contactName}
        </td>
        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{row.currency}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-green-700 dark:text-green-400">
          {parseFloat(row.current) > 0 ? fmt(row.current) : "—"}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-yellow-700 dark:text-yellow-400">
          {parseFloat(row.bucket1_30) > 0 ? fmt(row.bucket1_30) : "—"}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-orange-700 dark:text-orange-400">
          {parseFloat(row.bucket31_60) > 0 ? fmt(row.bucket31_60) : "—"}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">
          {parseFloat(row.bucket61_90) > 0 ? fmt(row.bucket61_90) : "—"}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-red-700 dark:text-red-300 font-medium">
          {parseFloat(row.bucket90Plus) > 0 ? fmt(row.bucket90Plus) : "—"}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
          {fmt(row.totalBalance)}
        </td>
      </tr>
      {expanded && hasItems && <ItemRows items={row.items} />}
    </>
  );
}

export function AgingTable({ report }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  if (report.rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
        No hay saldos pendientes con los filtros actuales.
      </div>
    );
  }

  const t = report.totals;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Cliente / Proveedor</th>
            <th className="px-4 py-2.5 text-left font-medium">Moneda</th>
            <th className="px-4 py-2.5 text-right font-medium text-green-700 dark:text-green-400">Al día</th>
            <th className="px-4 py-2.5 text-right font-medium text-yellow-700 dark:text-yellow-400">1–30d</th>
            <th className="px-4 py-2.5 text-right font-medium text-orange-700 dark:text-orange-400">31–60d</th>
            <th className="px-4 py-2.5 text-right font-medium text-red-600 dark:text-red-400">61–90d</th>
            <th className="px-4 py-2.5 text-right font-medium text-red-700 dark:text-red-300">+90d</th>
            <th className="px-4 py-2.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
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
        </tbody>
        <tfoot>
          <tr className="border-t-2 bg-muted/50 font-semibold text-sm">
            <td className="px-4 py-2.5" colSpan={2}>Total general</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{fmt(t.current)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{fmt(t.bucket1_30)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{fmt(t.bucket31_60)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{fmt(t.bucket61_90)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{fmt(t.bucket90Plus)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{fmt(t.totalBalance)}</td>
          </tr>
        </tfoot>
      </table>

      {Object.keys(report.byCurrency).length > 1 && (
        <div className="border-t px-4 py-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Desglose por moneda:</span>
          {Object.entries(report.byCurrency).map(([cur, totals]) => (
            <span key={cur}>
              <span className="font-mono font-medium text-foreground">{cur}</span>{" "}
              {fmt(totals.totalBalance)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
