"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Copy, Download, FileText, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { readReportDownload } from "@/features/reports/report-download";

export function PurchaseOrderDocumentActions({ projectId, purchaseOrderId, code }: {
  projectId: string;
  purchaseOrderId: string;
  code: string;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");
  const messageId = useId();
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!file) { setObjectUrl(null); return; }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function changeOpen(next: boolean) {
    if (sharing) return;
    setOpen(next);
    if (!next) { request.current?.abort(); setFile(null); setError(null); }
  }

  async function prepare() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setOpen(true);
    setError(null);
    setFile(null);
    setMessage(`Hola, te comparto la orden de compra ${code}. Por favor, confirmá la recepción del documento y la fecha de entrega prevista. Gracias.`);
    try {
      const response = await fetch(
        `/api/reports/proyectos/${projectId}/ordenes-compra/${purchaseOrderId}/export?format=pdf`,
        { credentials: "same-origin", signal: controller.signal },
      );
      const { blob, filename } = await readReportDownload(response, "pdf");
      if (!controller.signal.aborted) setFile(new File([blob], filename, { type: "application/pdf" }));
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudo preparar el PDF.");
    }
  }

  let canShareFile = false;
  if (file && typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
    try { canShareFile = navigator.canShare({ files: [file] }); } catch { /* Download remains available. */ }
  }

  async function share() {
    if (!file || sharing) return;
    setSharing(true);
    try {
      // The file is already prepared: this call keeps the user's transient activation.
      await navigator.share({ files: [file], title: `Orden de compra ${code}`, text: message });
      toast.info("Verificá el envío en la app elegida. El estado de la orden no cambió.");
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        toast.error("No se pudo compartir desde este dispositivo. Descargá el PDF y adjuntalo en la app que uses.");
      }
    } finally {
      setSharing(false);
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensaje copiado. Adjuntá el PDF y revisá el destinatario antes de enviarlo.");
    } catch {
      toast.error("No se pudo copiar. Seleccioná el mensaje y copialo manualmente.");
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" onClick={() => void prepare()}>
        <FileText className="h-4 w-4" aria-hidden />
        PDF para proveedor
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{code} · PDF para proveedor</DialogTitle>
            <DialogDescription>
              Revisá el PDF y después descargalo o compartilo con el proveedor desde tu dispositivo.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Descargar o compartir no confirma la orden ni acredita que el proveedor la recibió.
          </p>
          {error ? (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">{error}</p>
              <Button type="button" variant="outline" onClick={() => void prepare()}>Reintentar</Button>
            </div>
          ) : !file || !objectUrl ? (
            <p role="status" className="text-sm text-muted-foreground">Preparando PDF…</p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/20 p-3">
                <p role="status" className="text-sm font-medium">PDF listo para revisar</p>
                <p className="mt-1 break-all text-xs text-muted-foreground">{file.name}</p>
              </div>
              <div className="space-y-2 text-sm">
                <label htmlFor={messageId}>Mensaje para el proveedor</label>
                <Textarea id={messageId} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={4} disabled={sharing} />
              </div>
              <Button type="button" variant="outline" className="min-h-11" disabled={!message.trim() || sharing} onClick={() => void copyMessage()}>
                <Copy className="mr-2 h-4 w-4" aria-hidden />Copiar mensaje
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button asChild variant="outline" className="min-h-11"><a href={objectUrl} target="_blank" rel="noopener noreferrer">Ver PDF</a></Button>
                <Button asChild variant="outline" className="min-h-11"><a href={objectUrl} download={file.name}><Download className="mr-2 h-4 w-4" aria-hidden />Descargar PDF</a></Button>
                {canShareFile ? (
                  <Button type="button" className="min-h-11" disabled={sharing} onClick={() => void share()}>
                    <Share2 className="mr-2 h-4 w-4" aria-hidden />{sharing ? "Compartiendo…" : "Compartir archivo"}
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {canShareFile
                  ? "Elegí WhatsApp, correo u otra app disponible. Comprobá que incluya el PDF y el mensaje, revisá el destinatario y completá el envío allí."
                  : "Para enviarlo por WhatsApp o correo, copiá el mensaje, descargá el PDF y adjuntalo en la app que uses."}
              </p>
              <details className="text-xs text-muted-foreground">
                <summary className="min-h-11 cursor-pointer py-3">Qué contiene el archivo</summary>
                <p>Empresa, proveedor, obra, fechas, renglones e importes. Omite notas y referencias presupuestarias internas.</p>
              </details>
            </div>
          )}
          <DialogFooter><Button type="button" variant="outline" className="min-h-11" disabled={sharing} onClick={() => changeOpen(false)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
