"use client";

import { Download, Eye, FileX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  canAccessDocumentFile,
  canPreviewInBrowser,
  documentDownloadHref,
} from "../lib/document-file-utils";

const iconButtonClass = "size-11 shrink-0 md:size-8";

export type DocumentFileActionsProps = {
  documentId: string;
  mimeType: string;
  originalFileName: string;
  storageProvider: string;
  status: string;
  className?: string;
};

export function DocumentFileActions({
  documentId,
  mimeType,
  originalFileName,
  storageProvider,
  status,
  className,
}: DocumentFileActionsProps) {
  const canAccess = canAccessDocumentFile({ storageProvider, status });
  if (!canAccess) {
    if (
      storageProvider === "PLACEHOLDER" &&
      (status === "ACTIVE" || status === "ARCHIVED")
    ) {
      return (
        <div className={cn("flex flex-nowrap items-center justify-end gap-0.5", className)}>
          <Button
            variant="ghost"
            size="icon"
            className={iconButtonClass}
            disabled
            title="No hay archivo binario almacenado"
            aria-label="Sin archivo"
          >
            <FileX />
          </Button>
        </div>
      );
    }
    return null;
  }

  const showView = canPreviewInBrowser(mimeType, originalFileName);

  return (
    <div className={cn("flex flex-nowrap items-center justify-end gap-0.5", className)}>
      {showView ? (
        <Button variant="outline" size="icon" className={iconButtonClass} asChild>
          <a
            href={documentDownloadHref(documentId, "inline")}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Ver"
            title="Ver"
          >
            <Eye />
          </a>
        </Button>
      ) : null}
      <Button variant="outline" size="icon" className={iconButtonClass} asChild>
        <a
          href={documentDownloadHref(documentId, "attachment")}
          aria-label="Descargar"
          title="Descargar"
        >
          <Download />
        </a>
      </Button>
    </div>
  );
}
