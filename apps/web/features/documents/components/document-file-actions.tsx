"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  canAccessDocumentFile,
  canPreviewInBrowser,
  documentDownloadHref,
} from "../lib/document-file-utils";

export type DocumentFileActionsProps = {
  documentId: string;
  mimeType: string;
  originalFileName: string;
  storageProvider: string;
  status: string;
  /** Compact buttons for mobile cards. */
  size?: "sm" | "default";
  className?: string;
};

export function DocumentFileActions({
  documentId,
  mimeType,
  originalFileName,
  storageProvider,
  status,
  size = "sm",
  className,
}: DocumentFileActionsProps) {
  const canAccess = canAccessDocumentFile({ storageProvider, status });
  if (!canAccess) {
    if (
      storageProvider === "PLACEHOLDER" &&
      (status === "ACTIVE" || status === "ARCHIVED")
    ) {
      return (
        <div className={cn("flex flex-wrap items-center gap-1", className)}>
          <Button
            variant="ghost"
            size={size}
            disabled
            title="No hay archivo binario almacenado"
          >
            Sin archivo
          </Button>
        </div>
      );
    }
    return null;
  }

  const showView = canPreviewInBrowser(mimeType, originalFileName);

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {showView ? (
        <Button variant="outline" size={size} asChild>
          <a
            href={documentDownloadHref(documentId, "inline")}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver
          </a>
        </Button>
      ) : null}
      <Button variant="outline" size={size} asChild>
        <a href={documentDownloadHref(documentId, "attachment")}>Descargar</a>
      </Button>
    </div>
  );
}
