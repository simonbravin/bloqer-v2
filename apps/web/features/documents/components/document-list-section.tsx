"use client";

import type { DocumentAttachmentView } from "@bloqer/services";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { DocumentCards } from "./document-cards";
import { DocumentList } from "./document-list";

export function DocumentListSection({
  docs,
  projectId,
}: {
  docs: DocumentAttachmentView[];
  projectId: string;
}) {
  const view = useListViewMode();
  if (view === "cards") return <DocumentCards docs={docs} projectId={projectId} />;
  return <DocumentList docs={docs} projectId={projectId} />;
}
