"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog } from "@/components/ui/reason-alert-dialog";
import { useInventoryAction } from "../lib/use-inventory-action";

type Result = { error: string } | { success: true } | { ok: true };

export function InventoryStatusAction({
  label,
  description,
  action,
}: {
  label: string;
  description: string;
  action: () => Promise<Result>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending, run, isRunning } = useInventoryAction();
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <ConfirmAlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!isRunning()) setOpen(next);
        }}
        title={label}
        description={
          <div className="space-y-2">
            <p>{description}</p>
            {error ? (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        }
        confirmLabel={label}
        pending={pending}
        onConfirm={() =>
          run(async () => {
            setError(null);
            const result = await action();
            if ("error" in result) {
              setError(result.error);
              return;
            }
            setOpen(false);
            toast.success("Cambio guardado");
            router.refresh();
          })
        }
      />
    </>
  );
}
