"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelInternalTransferAction } from "@/app/(app)/tesoreria/actions";

export function CancelInternalTransferButton({ transferId }: { transferId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await cancelInternalTransferAction(transferId);
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          toast.success("Transferencia cancelada");
        });
      }}
    >
      Cancelar
    </Button>
  );
}
