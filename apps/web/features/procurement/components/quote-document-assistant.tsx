"use client";

import { useEffect, useRef, useState } from "react";
import type { ProcurementQuoteDocumentPreview } from "@bloqer/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { procurementActionBtnClass } from "../lib/procurement-ui";
import { mapQuoteDocumentLines, type QuoteDocumentPrefill, type QuoteRequestLine } from "../lib/quote-document-mapping";

const endpoint = "/api/ai/procurement-quote-preview";
export function QuoteDocumentAssistant({ projectId, purchaseRequestId, lines, disabled, onApply }: {
  projectId: string; purchaseRequestId: string; lines: QuoteRequestLine[]; disabled: boolean; onApply(value: QuoteDocumentPrefill): void;
}) {
  const [enabled, setEnabled] = useState(false), [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<ProcurementQuoteDocumentPreview | null>(null);
  const [choices, setChoices] = useState<string[]>([]), [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!file) { setFileUrl(null); return; }
    const url = URL.createObjectURL(file); setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(r => { if (!controller.signal.aborted) setEnabled(r?.enabled === true); }).catch(() => undefined);
    return () => { controller.abort(); active.current?.abort(); };
  }, []);
  function clear() { active.current?.abort(); active.current = null; setBusy(false); setPreview(null); setChoices([]); setReviewed(false); setError(null); }
  async function read() {
    if (!file || active.current || disabled) return;
    if (!file.size || file.size > 3 * 1024 * 1024 || !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Elegí un PDF, JPG, PNG o WebP de hasta 3 MiB."); return; }
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null); setPreview(null); setReviewed(false);
    try {
      const form = new FormData(); form.set("file", file); form.set("projectId", projectId); form.set("purchaseRequestId", purchaseRequestId);
      const response = await fetch(endpoint, { method: "POST", body: form, signal: controller.signal });
      const result = await response.json();
      if (controller.signal.aborted || active.current !== controller) return;
      if (!response.ok) { setError(result.error || "No se pudo leer la oferta."); return; }
      setPreview(result.preview); setChoices(result.preview.lines.map(() => ""));
    } catch { if (!controller.signal.aborted && active.current === controller) setError("No se pudo leer la oferta. Reintentá o continuá con la carga manual."); }
    finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  if (!enabled) return null;
  const mapping = preview ? mapQuoteDocumentLines(preview, lines, choices) : null;
  return <div className="form-section min-w-0 space-y-4 p-3 sm:p-4 [&_button]:h-auto [&_button]:min-h-11 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2 md:[&_button]:min-h-10">
    <Button type="button" variant="outline" className={procurementActionBtnClass} disabled={disabled} onClick={() => { clear(); setFile(null); setOpen(!open); }}> {open ? "Cerrar lectura de cotización" : "Leer cotización desde archivo"} </Button>
    {open ? <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Al leer, se envía el archivo al proveedor de IA configurado. Revisá la propuesta: aplicarla reemplaza los importes y condiciones de este formulario; no guarda ni adjudica. El archivo no queda adjunto: agregalo luego en los adjuntos de la cotización.</p>
      <Label htmlFor={`quote-file-${purchaseRequestId}`}>Archivo de cotización</Label>
      <Input id={`quote-file-${purchaseRequestId}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={e => { clear(); setFile(e.target.files?.[0] ?? null); }} />
      {fileUrl ? <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block text-sm underline">Abrir original seleccionado</a> : null}
      <Button type="button" disabled={disabled || busy || !file} onClick={() => void read()}>{busy ? "Leyendo cotización…" : "Leer oferta"}</Button>
      {busy ? <Button type="button" variant="outline" onClick={clear}>Cancelar lectura</Button> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {preview ? <div className="space-y-3">
        <p className="text-sm">Proveedor leído: {preview.supplierName ?? "No identificado"} · Moneda: {preview.currency ?? "Sin identificar"} · Total leído: {preview.total ?? "Sin identificar"}</p>
        {[...preview.blockingReasons, ...preview.warnings].map((message, i) => <p key={i} className="text-sm text-muted-foreground">{message}</p>)}
        {preview.lines.map((line, i) => <div key={i} className="space-y-1 rounded border p-2">
          <p className="text-sm break-words">{i + 1}. {line.description ?? "Descripción pendiente"} · {line.quantity ?? "?"} {line.unit ?? "?"} · Precio: {line.unitPrice ?? "?"} · IVA: {line.taxRate ?? "?"}% · Desc.: {line.discountPct ?? "?"}%</p>
          <Label htmlFor={`quote-map-${purchaseRequestId}-${i}`}>Vincular renglón {i + 1}</Label>
          <select id={`quote-map-${purchaseRequestId}-${i}`} className="w-full min-w-0 max-w-full rounded-md border border-input bg-background p-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" disabled={disabled} value={choices[i] ?? ""} onChange={e => { const selected = e.currentTarget.value; setChoices(old => old.map((v, index) => index === i ? selected : v)); setReviewed(false); }}>
            <option value="">Elegir ítem de la solicitud…</option>
            {lines.map(l => <option key={l.id} value={l.id}>{l.description} · {l.quantity} {l.unit}</option>)}
            <option value="exclude">Excluir de este formulario</option>
          </select>
        </div>)}
        {mapping?.error ? <p role="status" className="text-sm text-muted-foreground">{mapping.error}</p> : null}
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} disabled={disabled || !mapping?.value} onChange={e => setReviewed(e.target.checked)} />Revisé el original, las correspondencias y exclusiones; no hay cargos adicionales sin representar.</label>
        <Button type="button" disabled={disabled || !reviewed || !mapping?.value} onClick={() => { if (!reviewed || !mapping?.value) return; onApply(mapping.value); clear(); setOpen(false); }}>Aplicar propuesta al formulario</Button>
      </div> : null}
    </div> : null}
  </div>;
}
