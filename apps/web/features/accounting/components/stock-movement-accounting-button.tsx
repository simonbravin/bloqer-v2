"use client";

import { Button } from "@/components/ui/button";
import { generateJournalFromStockMovementAction } from "@/app/(app)/contabilidad/source-draft-actions";

export function StockMovementAccountingButton({
  stockMovementId,
  returnPath,
}: {
  stockMovementId: string;
  returnPath: string;
}) {
  return (
    <form action={generateJournalFromStockMovementAction.bind(null, stockMovementId, returnPath)}>
      <Button type="submit" size="sm" variant="outline" className="whitespace-nowrap">
        Generar asiento
      </Button>
    </form>
  );
}
