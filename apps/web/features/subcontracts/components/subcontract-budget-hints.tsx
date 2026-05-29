"use client";

import type { WbsSubcontractBudgetHint } from "@bloqer/services";
import { Button } from "@/components/ui/button";

type Props = {
  hints: WbsSubcontractBudgetHint[];
  onPick: (hint: WbsSubcontractBudgetHint) => void;
};

function formatMoney(value: string) {
  return parseFloat(value).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function SubcontractBudgetHints({ hints, onPick }: Props) {
  if (hints.length === 0) return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">Ítems con subcontrato en presupuesto</p>
        <p className="text-xs text-muted-foreground mt-1">
          Sugerencias desde el APU aprobado. Al elegir una, se completa la línea con WBS, unidad y
          monto referencial (editable).
        </p>
      </div>
      <ul className="max-h-48 overflow-y-auto space-y-2 text-sm">
        {hints.map((h) => (
          <li
            key={h.wbsNodeId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
          >
            <span>
              <span className="font-mono text-xs text-muted-foreground">{h.code}</span>{" "}
              <span className="font-medium">{h.name}</span>
              <span className="block text-xs text-muted-foreground">
                Presup. subcontrato: {formatMoney(h.budgetSubcontractTotal)} ({h.quantity}{" "}
                {h.unit})
              </span>
            </span>
            <Button type="button" variant="outline" size="sm" className="h-7 shrink-0" onClick={() => onPick(h)}>
              Usar
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
