"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useOperationalAction } from "@/hooks/use-operational-action";
import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog, ReasonAlertDialog } from "@/components/ui/reason-alert-dialog";

type Props = {
  label: string;
  title: string;
  description: ReactNode;
  requiresReason?: boolean;
  disabled?: boolean;
  confirmLabel?: string;
  variant?: "default" | "destructive" | "outline" | "ghost";
  className?: string;
  successMessage?: string;
  action: (reason: string) => Promise<{ ok: true } | { error: string }>;
};

/** Uses the existing reason confirmation and preserves it until the server outcome is known. */
export function ReasonActionButton({
  label,
  title,
  description,
  requiresReason = true,
  disabled = false,
  confirmLabel = "Confirmar",
  variant = "destructive",
  className,
  successMessage,
  action,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending, run, isBusy } = useOperationalAction({ onError: setError });
  const common = {
    open,
    title,
    confirmLabel,
    pending: pending || disabled,
    variant: variant === "destructive" ? ("destructive" as const) : ("default" as const),
    onOpenChange: (value: boolean) => {
      if (!value && (disabled || isBusy())) return;
      setOpen(value);
    },
    description: (
      <div className="space-y-2">
        {typeof description === "string" ? <p>{description}</p> : description}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
    ),
  };
  const execute = (reason: string) =>
    disabled
      ? Promise.resolve()
      : run(async () => {
          setError(null);
          const result = await action(reason);
          if ("error" in result) {
            setError(result.error);
            return;
          }
          setOpen(false);
          if (successMessage) toast.success(successMessage);
          router.refresh();
        });
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={variant}
        className={className}
        disabled={pending || disabled}
        onClick={() => {
          if (disabled) return;
          setError(null);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      {requiresReason ? (
        <ReasonAlertDialog {...common} minChars={1} onConfirm={execute} />
      ) : (
        <ConfirmAlertDialog {...common} onConfirm={() => execute("")} />
      )}
    </>
  );
}
