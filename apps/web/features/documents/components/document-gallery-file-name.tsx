"use client";

import Link from "next/link";
import type { DocumentAttachmentView } from "@bloqer/services";
import { cn } from "@/lib/utils";
import {
  canAccessDocumentFile,
  canInlineImagePreview,
  documentDownloadHref,
} from "../lib/document-file-utils";
import { useDocumentImageGallery } from "./document-image-gallery-provider";

type Props = {
  doc: Pick<
    DocumentAttachmentView,
    "id" | "originalFileName" | "mimeType" | "storageProvider" | "status"
  >;
  /** When set and file is not an in-gallery image, links to document detail. */
  projectId?: string | null;
  className?: string;
  titleAttr?: string;
};

/**
 * jpeg/png/webp → open in-app gallery (never navigate to /documentos/[id]).
 * Other files → link to detail when projectId is provided.
 */
export function DocumentGalleryFileName({
  doc,
  projectId = null,
  className,
  titleAttr,
}: Props) {
  const gallery = useDocumentImageGallery();
  const isInlineImage =
    canAccessDocumentFile(doc) &&
    canInlineImagePreview(doc.mimeType, doc.originalFileName);

  if (isInlineImage) {
    return (
      <button
        type="button"
        onClick={() => {
          if (gallery?.openAt(doc.id)) return;
          window.open(
            documentDownloadHref(doc.id, "inline"),
            "_blank",
            "noopener,noreferrer",
          );
        }}
        className={cn(
          "max-w-full truncate text-left font-medium underline-offset-2 hover:underline cursor-zoom-in",
          className,
        )}
        title={titleAttr ?? "Ver imagen"}
      >
        {doc.originalFileName}
      </button>
    );
  }

  if (projectId) {
    return (
      <Link
        href={`/proyectos/${projectId}/documentos/${doc.id}`}
        className={cn("font-medium underline-offset-2 hover:underline", className)}
        title={titleAttr ?? doc.originalFileName}
      >
        {doc.originalFileName}
      </Link>
    );
  }

  return (
    <span className={cn("font-medium", className)} title={titleAttr}>
      {doc.originalFileName}
    </span>
  );
}
