"use client";

import { useEffect, useRef, useState } from "react";
import { FileSearch, Loader2 } from "lucide-react";
import type { SupplierInvoiceDocumentPreview } from "@bloqer/ai";
import { Button } from "@/components/ui/button";
import { formatMoneyAmount } from "@/lib/format-money";
import { supplierInvoiceDocumentFileError } from "../lib/supplier-invoice-document-review";

type Props = {
  file: File | null;
  originalUrl: string | null;
  projectId?: string;
  disabled: boolean;
  onApply: (preview: SupplierInvoiceDocumentPreview, file: File) => void;
  onBusyChange: (busy: boolean) => void;
  onManual: () => void;
};

export function SupplierInvoiceDocumentAssistant({
  file, originalUrl, projectId, disabled, onApply, onBusyChange, onManual,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<SupplierInvoiceDocumentPreview | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const fileError = supplierInvoiceDocumentFileError(file);

  useEffect(() => {
    request.current?.abort();
    setPreview(null);
    setPreviewFile(null);
    setReviewed(false);
    setError(null);
    return () => request.current?.abort();
  }, [file, projectId]);

  useEffect(() => {
    if (preview) resultRef.current?.focus();
  }, [preview]);

  async function readDocument() {
    if (!file || fileError || request.current || busy || disabled) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setPreview(null);
    setPreviewFile(null);
    setReviewed(false);
    const data = new FormData();
    data.set("file", file);
    if (projectId) data.set("projectId", projectId);
    try {
      const response = await fetch("/api/ai/supplier-invoice-preview", {
        method: "POST", body: data, signal: controller.signal,
      });
      const body = await response.json() as { preview?: SupplierInvoiceDocumentPreview; error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok || !body.preview) {
        setError(body.error ?? "No se pudo leer el comprobante. Reintentá o seguí con la carga manual.");
        return;
      }
      setPreviewFile(file);
      setPreview(body.preview);
    } catch {
      if (!controller.signal.aborted) setError("No se pudo completar la lectura. El archivo sigue seleccionado: reintentá o continuá con la carga manual.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
        onBusyChange(false);
      }
    }
  }

  return (
    <section className="min-w-0 space-y-4" aria-label="Lectura asistida del comprobante">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="button" className="min-h-11" disabled={!file || Boolean(fileError) || disabled || busy} onClick={() => void readDocument()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <FileSearch className="mr-2 h-4 w-4" aria-hidden />}
          {busy ? "Leyendo comprobante…" : preview ? "Volver a leer" : "Leer comprobante"}
        </Button>
        {busy ? <Button type="button" className="min-h-11" variant="outline" onClick={() => request.current?.abort()}>Cancelar lectura</Button> : null}
        {originalUrl ? <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2">Ver original (otra pestaña)</a> : null}
      </div>
      <p className="text-xs text-muted-foreground">Al pulsar Leer comprobante se envía este archivo al proveedor de IA configurado. Revisás los datos antes de registrar una factura.</p>
      {busy ? <p role="status" className="text-sm text-muted-foreground">La lectura puede demorar unos segundos. Podés cancelarla sin perder el archivo.</p> : null}
      {fileError || error ? <div role="alert" className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm">
        <p>{fileError ?? error}</p>
        <Button type="button" variant="outline" disabled={busy || disabled} onClick={onManual}>Continuar con carga manual</Button>
      </div> : null}
      {preview && previewFile === file ? (
        <div ref={resultRef} tabIndex={-1} className="min-w-0 space-y-4 rounded-lg border bg-muted/20 p-3 sm:p-4 focus:outline-none" aria-label="Resultado de la lectura">
          <div>
            <h3 className="text-base font-semibold">2. Revisá la lectura</h3>
            <p className="mt-1 text-sm text-muted-foreground">Todavía no se guardó una factura. Los campos que no se pudieron leer se completan en el siguiente paso.</p>
          </div>
          <dl className="grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {[
              ["Proveedor leído", preview.supplierName], ["CUIT leído", preview.supplierTaxId],
              ["Referencia del comprobante", preview.fiscalReference],
              ["Total leído", preview.total && preview.currency === "ARS" ? formatMoneyAmount(preview.total, "ARS") : preview.total],
            ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value ?? "No identificado"}</dd></div>)}
          </dl>
          {preview.blockingReasons.length ? <div role="alert" className="space-y-2 rounded-md border border-destructive/40 bg-background p-3 text-sm">
            <p className="font-semibold">Este comprobante necesita carga manual</p>
            <ul className="list-disc space-y-1 pl-5">{preview.blockingReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
            <Button type="button" variant="outline" disabled={disabled} onClick={onManual}>Continuar con carga manual</Button>
          </div> : null}
          {preview.reviewReasons.length ? <div className="space-y-2 text-sm">
            <p className="font-medium">Para completar o verificar</p>
            <ul className="list-disc space-y-1 pl-5">{preview.reviewReasons.slice(0, 6).map((reason, index) => <li key={index}>{reason}</li>)}</ul>
            {preview.reviewReasons.length > 6 ? <details><summary className="min-h-11 cursor-pointer py-3 font-medium">Ver {preview.reviewReasons.length - 6} observaciones más</summary><ul className="list-disc space-y-1 pl-5">{preview.reviewReasons.slice(6).map((reason, index) => <li key={index}>{reason}</li>)}</ul></details> : null}
          </div> : null}
          <details className="rounded-md border bg-background px-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Ver todos los datos leídos ({preview.lines.length} {preview.lines.length === 1 ? "renglón" : "renglones"})</summary>
            <dl className="grid grid-cols-1 gap-3 pb-3 text-sm sm:grid-cols-2">
              {[
                ["Letra", preview.invoiceLetter], ["Moneda", preview.currency], ["Emisión", preview.issueDate], ["Vencimiento", preview.dueDate],
                ["Precios con IVA", preview.pricesIncludeTax == null ? null : preview.pricesIncludeTax ? "Sí" : "No"],
                ["IIBB %", preview.iibbPerceptionRate], ["Subtotal leído", preview.subtotal], ["IVA leído", preview.taxTotal], ["IIBB leído", preview.iibbPerceptionAmount],
              ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value ?? "Por completar"}</dd></div>)}
            </dl>
            <ol className="space-y-3 pb-3">
              {preview.lines.map((line, index) => <li key={index} className="min-w-0 space-y-2 rounded-md border p-3 text-sm">
                <p className="break-words font-medium">{index + 1}. {line.description ?? "Descripción por completar"}</p>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[
                  ["Cantidad", line.quantity], ["Precio unitario", line.unitPrice], ["IVA %", line.taxRate], ["Descuento %", line.discountPercent],
                ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words">{value ?? "Por completar"}</dd></div>)}</dl>
              </li>)}
            </ol>
          </details>
          {preview.warnings.length ? <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
          {preview.canApply ? <div className="space-y-3 border-t pt-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} disabled={disabled} />
              <span>Revisé la lectura y sus observaciones. Voy a usar estos datos y completar lo que falta. Reemplaza los datos y renglones que haya cargado en este formulario.</span>
            </label>
            <Button type="button" className="min-h-11 w-full sm:w-auto" disabled={!reviewed || disabled || !file || previewFile !== file} onClick={() => { if (file && reviewed && previewFile === file) onApply(preview, file); }}>Usar datos y completar</Button>
          </div> : null}
        </div>
      ) : null}
    </section>
  );
}
