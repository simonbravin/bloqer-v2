import type { DocumentAttachmentView } from "@bloqer/services";
import { formatDateTime } from "@/lib/format";

/** Registration time is not the photograph's capture time. */
export function DocumentProvenance({ doc }: {
  doc: Pick<DocumentAttachmentView, "uploadedByName" | "createdAt">;
}) {
  return (
    <div className="text-xs text-muted-foreground">
      <p>Registrado por {doc.uploadedByName ?? "Usuario desconocido"}</p>
      <time dateTime={doc.createdAt}>{formatDateTime(doc.createdAt)}</time>
    </div>
  );
}
