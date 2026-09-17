"use client";

import { Download, Eye, FileX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  canAccessDocumentFile,
  canInlineImagePreview,
  canPreviewInBrowser,
  documentDownloadHref,
} from "../lib/document-file-utils";
import { useDocumentImageGallery } from "./document-image-gallery-provider";

const iconButtonClass = "h-7 w-7 shrink-0";
const iconSvgClass = "h-3.5 w-3.5";

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
  const gallery = useDocumentImageGallery();
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
            <FileX className={iconSvgClass} aria-hidden />
          </Button>
        </div>
      );
    }
    return null;
  }

  const showView = canPreviewInBrowser(mimeType, originalFileName);
  const isInlineImage = canInlineImagePreview(mimeType, originalFileName);

  return (
    <div className={cn("flex flex-nowrap items-center justify-end gap-0.5", className)}>
      {showView ? (
        isInlineImage ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={iconButtonClass}
            aria-label="Ver"
            title="Ver"
            onClick={() => {
              if (gallery?.openAt(documentId)) return;
              window.open(
                documentDownloadHref(documentId, "inline"),
                "_blank",
                "noopener,noreferrer",
              );
            }}
          >
            <Eye className={iconSvgClass} aria-hidden />
          </Button>
        ) : (
          <Button variant="outline" size="icon" className={iconButtonClass} asChild>
            <a
              href={documentDownloadHref(documentId, "inline")}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Ver"
              title="Ver"
            >
              <Eye className={iconSvgClass} aria-hidden />
            </a>
          </Button>
        )
      ) : null}
      <Button variant="outline" size="icon" className={iconButtonClass} asChild>
        <a
          href={documentDownloadHref(documentId, "attachment")}
          aria-label="Descargar"
          title="Descargar"
        >
          <Download className={iconSvgClass} aria-hidden />
        </a>
      </Button>
    </div>
  );
}
