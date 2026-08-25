"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { archiveContactAction, reactivateContactAction } from "@/app/(app)/directorio/actions";

interface ContactArchiveActionsProps {
  contactId: string;
  status: "ACTIVE" | "ARCHIVED";
}

export function ContactArchiveActions({ contactId, status }: ContactArchiveActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<{ ok: true } | { error: string }>) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if ("error" in result) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setError("Error inesperado al actualizar el contacto");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {status === "ACTIVE" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={isPending}
          onClick={() => run(() => archiveContactAction(contactId))}
        >
          {isPending ? "Archivando..." : "Archivar"}
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => run(() => reactivateContactAction(contactId))}
        >
          {isPending ? "Reactivando..." : "Reactivar"}
        </Button>
      )}
      {error ? <p className="max-w-xs text-right text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
