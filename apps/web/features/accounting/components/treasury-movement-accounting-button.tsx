"use client";

import { Button } from "@/components/ui/button";
import { generateJournalFromTreasuryMovementAction } from "@/app/(app)/contabilidad/source-draft-actions";

export function TreasuryMovementAccountingButton({
  movementId,
  returnPath,
  label = "Generar asiento contable",
}: {
  movementId: string;
  returnPath: string;
  label?: string;
}) {
  return (
    <form action={generateJournalFromTreasuryMovementAction.bind(null, movementId, returnPath)}>
      <Button type="submit" size="sm" variant="outline" className="whitespace-nowrap">
        {label}
      </Button>
    </form>
  );
}
