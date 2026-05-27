"use client";

import type { StockMovementView } from "@bloqer/services";
import { StockMovementAccountingButton } from "@/features/accounting";
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
import { formatDate } from "@/lib/format";

function formatAmount(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}
import { StockMovementTypeBadge } from "./stock-movement-type-badge";

function consumptionCostOk(m: StockMovementView): boolean {
  const tc = m.totalCost ? parseFloat(m.totalCost) : NaN;
  const uc = m.unitCost ? parseFloat(m.unitCost) : NaN;
  const amount = Number.isFinite(tc) && tc > 0 ? tc : Number.isFinite(uc) && uc > 0 ? uc : 0;
  return amount > 0;
}

interface Props {
  movements: StockMovementView[];
  accountingReturnPath?: string;
  canEditAccounting?: boolean;
}

export function StockMovementList({ movements, accountingReturnPath, canEditAccounting }: Props) {
  const showGl = Boolean(accountingReturnPath && canEditAccounting);
  if (movements.length === 0) {
    return <ListEmptyState message="Sin movimientos de stock." />;
  }

  return (
    <TableScroll>
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
              <TableCell className="text-right tabular-nums">{m.quantity}</TableCell>
              <TableCell className="text-right tabular-nums">
                {m.unitCost ? `$${formatAmount(m.unitCost)}` : "—"}
              </TableCell>
              <TableCell>
                <span className={m.status === "CANCELLED" ? "text-muted-foreground line-through" : ""}>
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
  );
}
