"use client";

import type { ReactNode } from "react";
import type { StockMovementView } from "@bloqer/services";
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
import { StockMovementAccountingButton } from "@/features/accounting";
import { formatDate } from "@/lib/format";
import {
  formatQtyFromString,
  formatUnitPriceFromString,
  isPositiveMoneyAmount,
  isPositiveQty,
} from "@/lib/format-money";
import { StockMovementTypeBadge } from "./stock-movement-type-badge";
import { StockConsumptionMobileCards } from "./stock-consumption-mobile-cards";

function consumptionCostOk(m: StockMovementView): boolean {
  if (m.totalCost && isPositiveMoneyAmount(m.totalCost)) return true;
  if (m.unitCost && isPositiveQty(m.unitCost)) return true;
  return false;
}

interface Props {
  movements: StockMovementView[];
  accountingReturnPath?: string;
  canEditAccounting?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}

export function StockMovementList({
  movements,
  accountingReturnPath,
  canEditAccounting,
  emptyTitle = "Sin movimientos de stock",
  emptyDescription = "Los movimientos aparecen al confirmar recepciones, consumos o transferencias.",
  emptyAction,
}: Props) {
  const showGl = Boolean(accountingReturnPath && canEditAccounting);
  if (movements.length === 0) {
    return (
      <ListEmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
    );
  }

  return (
    <>
      <StockConsumptionMobileCards movements={movements} />
      <div className="hidden md:block">
    <TableScroll stickyFirstColumn>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Producto</TableHead>
            <TableHead>Depósito</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead className="text-right">Costo unit.</TableHead>
            <TableHead>Estado</TableHead>
            {showGl && <TableHead>Contabilidad</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="tabular-nums">{formatDate(m.movementDate)}</TableCell>
              <TableCell>
                <StockMovementTypeBadge type={m.type} />
              </TableCell>
              <TableCell>{m.productName}</TableCell>
              <TableCell>{m.warehouseName}</TableCell>
              <TableCell className="text-right tabular-nums">{formatQtyFromString(m.quantity)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {m.unitCost ? formatUnitPriceFromString(m.unitCost) : "—"}
              </TableCell>
              <TableCell>
                <span
                  className={m.status === "CANCELLED" ? "text-muted-foreground line-through" : ""}
                >
                  {m.status === "CONFIRMED" ? "Confirmado" : "Anulado"}
                </span>
              </TableCell>
              {showGl && (
                <TableCell>
                  {m.status === "CONFIRMED" &&
                  m.type === "OUT" &&
                  m.sourceType === "CONSUMPTION" &&
                  consumptionCostOk(m) &&
                  accountingReturnPath ? (
                    <StockMovementAccountingButton
                      stockMovementId={m.id}
                      returnPath={accountingReturnPath}
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
      </div>
    </>
  );
}
