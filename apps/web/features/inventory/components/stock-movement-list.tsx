"use client";

import type { StockMovementView } from "@bloqer/services";
import { StockMovementAccountingButton } from "@/features/accounting";
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
    return <p className="text-sm text-muted-foreground">Sin movimientos de stock.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Fecha</th>
            <th className="px-4 py-2 text-left font-medium">Tipo</th>
            <th className="px-4 py-2 text-left font-medium">Producto</th>
            <th className="px-4 py-2 text-left font-medium">Depósito</th>
            <th className="px-4 py-2 text-right font-medium">Cantidad</th>
            <th className="px-4 py-2 text-right font-medium">Costo unit.</th>
            <th className="px-4 py-2 text-left font-medium">Estado</th>
            {showGl && (
              <th className="px-4 py-2 text-left font-medium">Contabilidad</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {movements.map((m) => (
            <tr key={m.id} className="hover:bg-muted/30">
              <td className="px-4 py-2 tabular-nums">
                {new Date(m.movementDate).toLocaleDateString("es-AR")}
              </td>
              <td className="px-4 py-2">
                <StockMovementTypeBadge type={m.type} />
              </td>
              <td className="px-4 py-2">{m.productName}</td>
              <td className="px-4 py-2">{m.warehouseName}</td>
              <td className="px-4 py-2 text-right tabular-nums">{m.quantity}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {m.unitCost ? `$${parseFloat(m.unitCost).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—"}
              </td>
              <td className="px-4 py-2">
                <span className={m.status === "CANCELLED" ? "text-muted-foreground line-through" : ""}>
                  {m.status === "CONFIRMED" ? "Confirmado" : "Anulado"}
                </span>
              </td>
              {showGl && (
                <td className="px-4 py-2">
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
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
