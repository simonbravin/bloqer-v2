"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { uploadDocumentAction } from "@/features/documents/upload-document-action";
import {
  formatPartialEntityUploadMessage,
  uploadPendingEntityEvidence,
} from "@/features/documents/lib/upload-pending-entity-evidence";
import type { PendingEvidenceQueuedFile } from "@/features/documents/components/pending-evidence-picker";
import type { PendingEvidenceQueueItem } from "@/features/documents/components/pending-evidence-retry-panel";

type Options = {
  projectId: string;
  linkedEntityType: string;
  category: string;
  afterUploadPath: (entityId: string) => string;
  createdLabel: string;
  itemNounSingular: string;
  itemNounPlural: string;
  detailHref: (entityId: string) => string;
  onRetrySuccess?: (entityId: string) => void;
};

export function usePendingEntityEvidence(options: Options) {
  const router = useRouter();
  const [files, setFiles] = useState<PendingEvidenceQueuedFile[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [queue, setQueue] = useState<PendingEvidenceQueueItem[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [showRetry, setShowRetry] = useState(false);

  async function uploadItems(
    entityId: string,
    items: PendingEvidenceQueueItem[],
    filter?: { onlyClientId?: string },
  ): Promise<PendingEvidenceQueueItem[]> {
    const next = items.map((item) => ({ ...item }));
    for (let i = 0; i < next.length; i++) {
      const item = next[i];
      if (!item || item.status === "ok") continue;
      if (filter?.onlyClientId && item.clientId !== filter.onlyClientId) continue;
      next[i] = { ...item, status: "uploading", error: undefined };
      setQueue([...next]);
      const result = await uploadPendingEntityEvidence({
        projectId: options.projectId,
        entityId,
        linkedEntityType: options.linkedEntityType,
        files: [{ file: item.file, clientId: item.clientId }],
        upload: uploadDocumentAction,
        category: options.category,
        afterUploadPath: options.afterUploadPath(entityId),
      }).catch((err: unknown) => ({
        uploaded: 0,
        failures: [
          {
            index: 0,
            fileName: item.file.name,
            error: err instanceof Error ? err.message : "No se pudo subir",
          },
        ],
      }));
      if (result.failures.length > 0) {
        next[i] = {
          ...item,
          status: "error",
          error: result.failures[0]?.error ?? "No se pudo subir",
        };
      } else {
        next[i] = { ...item, status: "ok", error: undefined };
      }
      setQueue([...next]);
    }
    return next;
  }

  function partialMessage(after: PendingEvidenceQueueItem[]): string | null {
    const failed = after.filter((item) => item.status === "error");
    return formatPartialEntityUploadMessage({
      createdLabel: options.createdLabel,
      itemNounSingular: options.itemNounSingular,
      itemNounPlural: options.itemNounPlural,
      result: {
        uploaded: after.filter((item) => item.status === "ok").length,
        failures: failed.map((item, index) => ({
          index,
          fileName: item.file.name,
          error: item.error ?? "No se pudo subir",
        })),
      },
    });
  }

  async function handleCreated(id: string): Promise<{ navigate?: boolean; message?: string } | void> {
    if (files.length === 0) return;
    const initial: PendingEvidenceQueueItem[] = files.map((f) => ({ ...f, status: "pending" }));
    setCreatedId(id);
    setQueue(initial);
    const after = await uploadItems(id, initial);
    const failed = after.filter((item) => item.status === "error");
    if (failed.length === 0) return;
    setShowRetry(true);
    return { navigate: false, message: partialMessage(after) ?? undefined };
  }

  async function retryFailed() {
    if (!createdId) return;
    setRetrying(true);
    try {
      const after = await uploadItems(createdId, queue);
      const failed = after.filter((item) => item.status === "error");
      if (failed.length === 0) {
        toast.success("Archivos subidos.");
        options.onRetrySuccess?.(createdId);
        router.replace(options.detailHref(createdId));
        router.refresh();
        return;
      }
      toast.warning(partialMessage(after) ?? "Algunos archivos no se pudieron subir.");
    } finally {
      setRetrying(false);
    }
  }

  async function retryOne(clientId: string) {
    if (!createdId) return;
    const item = queue.find((q) => q.clientId === clientId);
    if (!item || item.status === "ok") return;
    setRetrying(true);
    try {
      const after = await uploadItems(createdId, queue, { onlyClientId: clientId });
      const failed = after.filter((row) => row.status === "error");
      if (failed.length === 0) {
        toast.success("Archivos subidos.");
        options.onRetrySuccess?.(createdId);
        router.replace(options.detailHref(createdId));
        router.refresh();
        return;
      }
      toast.warning(partialMessage(after) ?? "Algunos archivos no se pudieron subir.");
    } finally {
      setRetrying(false);
    }
  }

  const failedCount = queue.filter((item) => item.status === "error").length;
  const retryVisible = showRetry && Boolean(createdId) && failedCount > 0;

  return {
    files,
    setFiles,
    createdId,
    queue,
    retrying,
    retryVisible,
    failedCount,
    handleCreated,
    retryFailed,
    retryOne,
  };
}
