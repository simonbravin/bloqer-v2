"use client";

import { useSearchParams } from "next/navigation";
import type { DocumentAttachmentView } from "@bloqer/services";
import { DocumentCards } from "./document-cards";
import { DocumentList } from "./document-list";

export function DocumentListSection({
  docs,
  projectId,
}: {
  docs: DocumentAttachmentView[];
  projectId: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") return <DocumentCards docs={docs} projectId={projectId} />;
  return <DocumentList docs={docs} projectId={projectId} />;
}
