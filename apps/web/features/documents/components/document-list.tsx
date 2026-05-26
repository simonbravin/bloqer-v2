import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import type { DocumentAttachmentView } from "@bloqer/services";
import { DocumentCategoryBadge } from "./document-category-badge";
import { DocumentStatusBadge }   from "./document-status-badge";

function fmtDate(iso: string) {
  return formatDate(iso);
}

function fmtSize(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  docs:      DocumentAttachmentView[];
  projectId: string;
}

export function DocumentList({ docs, projectId }: Props) {
  if (docs.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
        No hay documentos para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Archivo</th>
            <th className="px-4 py-2.5 text-left font-medium">Categoría</th>
            <th className="px-4 py-2.5 text-left font-medium">Estado</th>
            <th className="px-4 py-2.5 text-left font-medium">Tamaño</th>
            <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => (
            <tr key={doc.id} className="border-t hover:bg-muted/30 transition-colors">
              <td className="px-4 py-2.5">
                <Link
                  href={`/proyectos/${projectId}/documentos/${doc.id}`}
                  className="font-medium hover:underline underline-offset-2"
                >
                  {doc.originalFileName}
                </Link>
                {doc.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                    {doc.description}
                  </p>
                )}
              </td>
              <td className="px-4 py-2.5">
                <DocumentCategoryBadge category={doc.category} />
              </td>
              <td className="px-4 py-2.5">
                <DocumentStatusBadge status={doc.status} />
              </td>
              <td className="px-4 py-2.5 text-muted-foreground text-xs tabular-nums">
                {fmtSize(doc.sizeBytes)}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                {fmtDate(doc.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
