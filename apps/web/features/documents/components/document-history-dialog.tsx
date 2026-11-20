"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History } from "lucide-react";
import type { DocumentHistoryEntry, DocumentHistoryPage } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { DocumentHistoryTools } from "./document-history-tools";

const labels: Record<string, string> = {
  "document.created": "Registro creado",
  "document.upload_initiated": "Carga iniciada",
  "document.uploaded": "Carga registrada",
  "document.upload_confirmed": "Carga confirmada",
  "document.archived": "Archivado",
  "document.reactivated": "Restaurado",
  "document.deleted": "Eliminado de la biblioteca",
  "document.moved_folder": "Movido de carpeta",
};

function HistoryContent({ documentId }: { documentId: string }) {
  const [entries, setEntries] = useState<DocumentHistoryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCursor = useRef<string | undefined>(undefined);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (cursor?: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    retryCursor.current = cursor;
    setPending(true);
    setError(null);
    try {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/history${query}`, {
        cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) {
          setEntries([]);
          setNextCursor(null);
        }
        throw new Error("History unavailable");
      }
      const page = await response.json() as DocumentHistoryPage;
      if (controller.signal.aborted) return;
      setEntries((previous) => cursor ? [...previous, ...page.entries] : page.entries);
      setNextCursor(page.nextCursor);
    } catch {
      if (!controller.signal.aborted) setError("No se pudo consultar el historial. Revisá tu acceso e intentá de nuevo.");
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }, [documentId]);

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);

  return (
    <div className="space-y-3" aria-busy={pending}>
      <div className="max-h-[55vh] overflow-y-auto">
        <ol className="divide-y">
          {entries.map((entry) => (
            <li key={entry.id} className="space-y-1 py-3 text-sm">
              <p className="font-medium">{labels[entry.action] ?? "Actividad registrada"}</p>
              <p className="break-words text-muted-foreground">{entry.actorName}</p>
              <time dateTime={entry.createdAt} className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</time>
            </li>
          ))}
        </ol>
        {!pending && !error && entries.length === 0 ? <p className="text-sm text-muted-foreground">No hay movimientos registrados para este archivo.</p> : null}
      </div>
      {pending ? <p role="status" className="text-sm text-muted-foreground">Cargando historial…</p> : null}
      {error ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" disabled={pending} onClick={() => void load(retryCursor.current)}>Reintentar</Button>
        </div>
      ) : nextCursor ? (
        <Button type="button" variant="outline" disabled={pending} onClick={() => void load(nextCursor)}>Ver anteriores</Button>
      ) : null}
    </div>
  );
}

export function DocumentHistoryDialog({ documentId, fileName, canVerifyFile = false }: { documentId: string; fileName: string; canVerifyFile?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" aria-label="Historial" title="Historial">
          <History className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Historial del archivo</DialogTitle>
          <DialogDescription className="break-all">{fileName}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Movimientos registrados en Bloqer, del más reciente al más antiguo. Iniciar una carga no confirma que el archivo haya quedado guardado.</p>
        {open ? <HistoryContent key={documentId} documentId={documentId} /> : null}
        {open ? <DocumentHistoryTools key={`tools-${documentId}`} documentId={documentId} canVerifyFile={canVerifyFile} /> : null}
      </DialogContent>
    </Dialog>
  );
}
