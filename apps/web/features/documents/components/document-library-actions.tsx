"use client";

import type { DocumentAttachmentView } from "@bloqer/services";
import {
  archiveDocumentAction,
  restoreDocumentAction,
  softDeleteDocumentAction,
} from "@/app/(app)/proyectos/[id]/documentos/actions";
import { cn } from "@/lib/utils";
import { linkedDocumentDeleteBlockedReason } from "../lib/linked-entity-label";
import { DocumentFileActions } from "./document-file-actions";
import { DocumentMutateIconActions } from "./document-mutate-icon-actions";

export function DocumentLibraryActions({
  doc,
  projectId,
  className,
  redirectAfterDelete = false,
}: {
  doc: DocumentAttachmentView;
  projectId: string;
  className?: string;
  /** After delete, leave the document detail and return to the library. */
  redirectAfterDelete?: boolean;
}) {
  const extra = [`/proyectos/${projectId}/documentos`];

  return (
    <div className={cn("flex flex-nowrap items-center justify-end gap-0.5", className)}>
      <DocumentFileActions
        documentId={doc.id}
        mimeType={doc.mimeType}
        originalFileName={doc.originalFileName}
        storageProvider={doc.storageProvider}
        status={doc.status}
      />
      <DocumentMutateIconActions
        fileName={doc.originalFileName}
        status={doc.status}
        canMutate={doc.canMutate}
        canDelete={doc.canDelete}
        deleteBlockedReason={
          doc.canMutate && !doc.canDelete
            ? linkedDocumentDeleteBlockedReason(doc.linkedEntityType)
            : undefined
        }
        onArchive={
          doc.canMutate ? () => archiveDocumentAction(doc.id, projectId, extra) : undefined
        }
        onRestore={
          doc.canMutate ? () => restoreDocumentAction(doc.id, projectId, extra) : undefined
        }
        onDelete={
          doc.canDelete
            ? () =>
                softDeleteDocumentAction(doc.id, projectId, {
                  extraPathsToRevalidate: extra,
                  redirectToProjectDocuments: redirectAfterDelete,
                })
            : undefined
        }
      />
    </div>
  );
}
