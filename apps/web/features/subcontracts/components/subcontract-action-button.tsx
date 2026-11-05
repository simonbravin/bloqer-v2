"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOperationalAction } from "@/hooks/use-operational-action";
import { Button } from "@/components/ui/button";

export function SubcontractActionButton({
  label,
  action,
  variant = "default",
}: {
  label: string;
  action: () => Promise<{ ok: true } | { error: string }>;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useOperationalAction({ onError: setError });
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant={variant}
        disabled={pending}
        onClick={() =>
          void run(async () => {
            setError(null);
            const result = await action();
            if ("error" in result) {
              setError(result.error);
              return;
            }
            router.refresh();
          })
        }
      >
        {pending ? "Procesando…" : label}
      </Button>
      {error && (
        <p role="alert" className="max-w-sm text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
