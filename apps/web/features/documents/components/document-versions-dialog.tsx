"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import type { getDocumentVersionLinks } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DocumentUploadDialog } from "./document-upload-dialog";
import type { DocumentFormProps } from "./document-form";
import { DocumentProvenance } from "./document-provenance";
import { DocumentHistoryDialog } from "./document-history-dialog";
import { canAccessDocumentFile, documentDownloadHref } from "../lib/document-file-utils";

type VersionLinks = Awaited<ReturnType<typeof getDocumentVersionLinks>>;

function VersionsContent({ documentId }: { documentId: string }) {
  const [data, setData] = useState<VersionLinks | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const focus = useRef(documentId);
  const load = useCallback(async (id: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    focus.current = id;
    setPending(true);
    setData(null);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(id)}/versions`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("No se pudieron consultar las revisiones. Revisá tu acceso e intentá de nuevo.");
      const result = await response.json() as VersionLinks;
      if (!controller.signal.aborted) setData(result);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "No se pudieron consultar las revisiones");
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }, []);
  useEffect(() => { void load(documentId); return () => request.current?.abort(); }, [documentId, load]);

  const doc = data?.document;
  const linkedEntity = doc?.linkedEntityType && doc.linkedEntityType !== "PROJECT" && doc.linkedEntityId
    ? { type: doc.linkedEntityType, id: doc.linkedEntityId, ...(doc.relatedEntityId ? { subcontractId: doc.relatedEntityId } : {}) } as DocumentFormProps["linkedEntity"]
    : undefined;
  return <div className="space-y-3" aria-busy={pending}>
    {pending ? <p role="status">Consultando revisiones…</p> : null}
    {error ? <div><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => void load(focus.current)}>Reintentar</Button></div> : null}
    {data && doc ? <>
      <p className="break-all font-medium">{doc.originalFileName}</p>
      <DocumentProvenance doc={doc} />
      <p className="text-xs text-muted-foreground">{doc.status === "ARCHIVED" ? "Archivado" : "Activo"}{data.next ? " · Tiene una revisión posterior" : " · Última revisión confirmada"}</p>
      <div className="flex flex-wrap items-center gap-2">
        {canAccessDocumentFile(doc) ? <Button variant="outline" size="sm" asChild><a href={documentDownloadHref(doc.id, "attachment")}>Descargar esta revisión</a></Button> : <p className="text-xs text-muted-foreground">Este registro no tiene archivo original guardado.</p>}
        <DocumentHistoryDialog documentId={doc.id} fileName={doc.originalFileName} canVerifyFile={doc.storageProvider === "R2"} />
      </div>
      <div className="flex flex-wrap gap-2">
        {data.previous ? <Button variant="outline" size="sm" onClick={() => void load(data.previous!.id)}>Revisión anterior</Button> : null}
        {data.next ? <Button variant="outline" size="sm" onClick={() => void load(data.next!.id)}>Revisión siguiente</Button> : null}
      </div>
      {data.canCreateVersion ? <DocumentUploadDialog
        projectId={doc.projectId} folderId={doc.folderId} linkedEntity={linkedEntity}
        replacesAttachmentId={doc.id} storageConfigured={data.storageConfigured} defaultCategory={doc.category}
        triggerLabel="Subir nueva revisión" title="Nueva revisión" submitLabel="Guardar nueva revisión" triggerVariant="outline"
        description="El archivo anterior se conserva. Solo se archivará cuando la nueva carga quede confirmada."
        onSuccess={() => void load(doc.id)}
      /> : null}
    </> : null}
  </div>;
}

export function DocumentVersionsDialog({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" size="icon" className="h-7 w-7 shrink-0" title="Revisiones" aria-label="Revisiones"><Layers className="h-3.5 w-3.5" aria-hidden /></Button></DialogTrigger>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Revisiones del archivo</DialogTitle><DialogDescription>Cada revisión conserva su original, responsable y fecha de registro.</DialogDescription></DialogHeader>
      {open ? <VersionsContent key={documentId} documentId={documentId} /> : null}
    </DialogContent>
  </Dialog>;
}
