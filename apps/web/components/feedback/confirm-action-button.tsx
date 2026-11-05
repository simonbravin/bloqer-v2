"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog } from "@/components/ui/reason-alert-dialog";
import { useOperationalAction } from "@/hooks/use-operational-action";

type Props = {
  label: string;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  variant?: "default" | "destructive" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  successMessage?: string;
  action: () => Promise<{ ok: true } | { error: string }>;
};

/** Client confirm + toast wrapper for destructive server actions that return { ok } | { error }. */
export function ConfirmActionButton({
  label,
  title,
  description,
  confirmLabel = "Confirmar",
  variant = "destructive",
  size = "sm",
  className,
  successMessage,
  action,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending, run, isBusy } = useOperationalAction({ onError: setError });

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
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
          if (!next && isBusy()) return;
          setOpen(next);
        }}
        title={title}
        description={
          <div className="space-y-2">
            {typeof description === "string" ? <p>{description}</p> : description}
            {error ? (
              <p className="text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        }
        confirmLabel={confirmLabel}
        variant={variant === "destructive" ? "destructive" : "default"}
        pending={pending}
        onConfirm={() =>
          run(async () => {
            setError(null);
            const res = await action();
            if ("error" in res) {
              setError(res.error);
              toast.error(res.error);
              return;
            }
            setOpen(false);
            if (successMessage) toast.success(successMessage);
            router.refresh();
          })
        }
      />
    </>
  );
}
