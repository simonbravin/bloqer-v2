import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { DocumentAttachmentView } from "@bloqer/services";
import { DocumentCategoryBadge } from "./document-category-badge";
import { DocumentStatusBadge } from "./document-status-badge";

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentCards({
  docs,
  projectId,
}: {
  docs: DocumentAttachmentView[];
  projectId: string;
}) {
  if (docs.length === 0) {
    return <ListEmptyState message="No hay documentos para los filtros seleccionados." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {docs.map((doc) => (
        <Link
          key={doc.id}
          href={`/proyectos/${projectId}/documentos/${doc.id}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <p className="line-clamp-2 font-semibold leading-snug">{doc.originalFileName}</p>
          {doc.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{doc.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <DocumentCategoryBadge category={doc.category} />
            <DocumentStatusBadge status={doc.status} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {fmtSize(doc.sizeBytes)} · {formatDate(doc.createdAt)}
          </p>
        </Link>
      ))}
    </div>
  );
}
