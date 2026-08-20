"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export type PendingEvidenceQueueStatus = "pending" | "uploading" | "ok" | "error";

export type PendingEvidenceQueueItem = {
  clientId: string;
  file: File;
  status: PendingEvidenceQueueStatus;
  error?: string;
};

type Props = {
  title: string;
  description: string;
  itemLabel?: string;
  queue: PendingEvidenceQueueItem[];
  retrying: boolean;
  detailHref: string;
  detailLabel: string;
  onRetryAll: () => void;
  onRetryOne: (clientId: string) => void;
};

export function PendingEvidenceRetryPanel({
  title,
  description,
  itemLabel = "Archivo",
  queue,
  retrying,
  detailHref,
  detailLabel,
  onRetryAll,
  onRetryOne,
}: Props) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ul className="space-y-2">
        {queue.map((item, i) => (
          <li key={item.clientId} className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {itemLabel} {i + 1}
              </p>
              <p className="truncate text-xs text-muted-foreground">{item.file.name}</p>
              {item.status === "ok" ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">✓ Subida</p>
              ) : item.status === "uploading" ? (
                <p className="text-xs text-muted-foreground">Subiendo…</p>
              ) : (
                <p className="text-xs text-destructive">{item.error ?? "Error"}</p>
              )}
            </div>
            {item.status === "error" ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 shrink-0 md:min-h-9"
                disabled={retrying}
                onClick={() => onRetryOne(item.clientId)}
              >
                Reintentar
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="min-h-11 md:min-h-9"
          disabled={retrying}
          onClick={onRetryAll}
        >
          {retrying ? "Subiendo…" : "Reintentar pendientes"}
        </Button>
        <Button asChild variant="outline" className="min-h-11 md:min-h-9">
          <Link href={detailHref}>{detailLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
