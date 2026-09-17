"use client";

import type { DocumentAttachmentView } from "@bloqer/services";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { DocumentCards } from "./document-cards";
import { DocumentList } from "./document-list";
import { DocumentImageGalleryProvider } from "./document-image-gallery-provider";

export function DocumentListSection({
  docs,
  projectId,
}: {
  docs: DocumentAttachmentView[];
  projectId: string;
}) {
  const view = useListViewMode();
  return (
    <DocumentImageGalleryProvider docs={docs}>
      {view === "cards" ? (
        <DocumentCards docs={docs} projectId={projectId} />
      ) : (
        <DocumentList docs={docs} projectId={projectId} />
      )}
    </DocumentImageGalleryProvider>
  );
}
