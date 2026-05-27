import { formatDate } from "@/lib/format";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
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
    return <ListEmptyState message="No hay documentos para los filtros seleccionados." />;
  }

  return (
    <TableScroll>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Archivo</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Tamaño</TableHead>
            <TableHead>Fecha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell>
                <Link
                  href={`/proyectos/${projectId}/documentos/${doc.id}`}
                  className="font-medium hover:underline"
                >
                  {doc.originalFileName}
                </Link>
                {doc.description ? (
                  <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{doc.description}</p>
                ) : null}
              </TableCell>
              <TableCell>
                <DocumentCategoryBadge category={doc.category} />
              </TableCell>
              <TableCell>
                <DocumentStatusBadge status={doc.status} />
              </TableCell>
              <TableCell className="text-xs tabular-nums text-muted-foreground">{fmtSize(doc.sizeBytes)}</TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(doc.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
