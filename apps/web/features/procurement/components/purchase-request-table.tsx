"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { useClientTableSort } from "@/hooks/use-client-table-sort";
import type { PurchaseRequestView } from "@bloqer/services";
import { PurchaseRequestStatusBadge } from "./purchase-request-status-badge";
import { purchaseRequestNeededByOverdueDays } from "../lib/purchase-delivery-overdue";

function descriptionTooltip(pr: PurchaseRequestView): string {
  const lines = pr.lines.map((l) => l.description).filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : "";
}

export function PurchaseRequestTable({
  requests,
  projectId,
  emptyState,
}: {
  requests: PurchaseRequestView[];
  projectId: string;
  emptyState: ReactNode;
}) {
  const accessors = useMemo(
    () => ({
      code: (pr: PurchaseRequestView) => pr.code,
      amount: (pr: PurchaseRequestView) => {
        if (pr.estimatedAmount == null || pr.estimatedAmount === "") return null;
        const n = Number(pr.estimatedAmount);
        return Number.isFinite(n) ? n : null;
      },
    }),
    [],
  );

  const { sorted, sortKey, sortDir, toggleSort } = useClientTableSort(
    requests,
    accessors,
    "code",
  );

  return (
    <TableScroll>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead
              label="Código"
              sortKey="code"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <TableHead>Estado</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>EDT</TableHead>
            <SortableTableHead
              align="right"
              label="Monto est."
              sortKey="amount"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <TableHead>Proveedor</TableHead>
            <TableHead>Necesaria para</TableHead>
            <TableHead className="text-right">Ver</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="whitespace-normal p-0">
                {emptyState}
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((pr) => (
              <TableRow key={pr.id}>
                <TableCell className="font-medium">{pr.code}</TableCell>
                <TableCell>
                  <PurchaseRequestStatusBadge status={pr.status} />
                </TableCell>
                <TableCell className="max-w-[200px]">
                  {pr.firstLineDescription ? (
                    <span
                      className="block truncate text-sm"
                      title={descriptionTooltip(pr)}
                    >
                      {pr.firstLineDescription}
                      {pr.linesCount > 1 ? (
                        <span className="text-muted-foreground"> +{pr.linesCount - 1} más</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {pr.hasMultipleWbs ? (
                    <span className="text-muted-foreground">Múltiple</span>
                  ) : pr.primaryWbsNodeCode ? (
                    <span title={pr.primaryWbsNodeName ?? undefined}>{pr.primaryWbsNodeCode}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {pr.estimatedAmount && pr.estimatedAmountCurrency ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="tabular-nums text-sm">
                        {formatMoneyAmount(pr.estimatedAmount, pr.estimatedAmountCurrency)}
                      </span>
                      {pr.estimatedAmountSource ? (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] leading-4">
                          {pr.estimatedAmountSource === "quote"
                            ? "Cotización"
                            : pr.estimatedAmountSource === "orders"
                              ? "Órdenes"
                              : "Presup."}
                        </Badge>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                  {pr.selectedSupplierName ?? "—"}
                </TableCell>
                <TableCell>
                  {pr.neededByDate ? (
                    (() => {
                      const overdue = purchaseRequestNeededByOverdueDays(
                        pr.status,
                        pr.neededByDate,
                      );
                      return (
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <span>{formatDate(pr.neededByDate)}</span>
                          {overdue > 0 ? (
                            <Badge variant="destructive" className="whitespace-nowrap">
                              Vencida {overdue} d
                            </Badge>
                          ) : null}
                        </span>
                      );
                    })()
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="link" size="sm">
                    <Link href={`/proyectos/${projectId}/solicitudes-compra/${pr.id}`}>Detalle</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
