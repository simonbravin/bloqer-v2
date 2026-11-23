"use client";

import { useId, useRef, useState } from "react";
import { supplierQuoteResponseSchema, type SupplierQuoteRequestSnapshot, type SupplierQuoteResponse } from "@bloqer/validators";
import { QUOTE_LINE_OFFER_KINDS, QUOTE_LINE_OFFER_LABELS } from "@bloqer/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DecimalInput } from "@/components/ui/decimal-input";
import { CurrencySelect } from "@/components/ui/currency-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { ManualFxField } from "@/features/finance/components/manual-fx-field";
import { formatQtyFromString } from "@/lib/format-money";
import { PROCUREMENT_FORM_ACTIONS_CLASS, PROCUREMENT_FORM_FIELDS_CLASS } from "../lib/procurement-form-layout";

export function SupplierQuoteResponseForm({ snapshot, initial, internal = false, onSubmit, onCancel }: {
  snapshot: SupplierQuoteRequestSnapshot;
  initial?: SupplierQuoteResponse;
  internal?: boolean;
  onSubmit: (response: SupplierQuoteResponse, fxRate: string) => Promise<{ error?: string }>;
  onCancel?: () => void;
}) {
  const prefix = useId();
  const [data, setData] = useState({
    version: 1 as const, currency: initial?.currency ?? "", pricesIncludeTax: initial ? String(initial.pricesIncludeTax) : "",
    iibbPerceptionRate: initial?.iibbPerceptionRate ?? "", leadTimeDays: initial ? String(initial.leadTimeDays) : "",
    validUntil: initial?.validUntil ?? "", notes: initial?.notes ?? "",
    lines: snapshot.lines.map(line => initial?.lines.find(item => item.purchaseRequestLineId === line.id) ?? {
      purchaseRequestLineId: line.id, offerKind: "QUOTED" as const, unitPrice: "", taxRate: "", discountPct: "",
    }),
  });
  const dataRef = useRef(data); dataRef.current = data;
  const [fxRate, setFxRate] = useState("");
  const fxRef = useRef(fxRate); fxRef.current = fxRate;
  const [review, setReview] = useState<SupplierQuoteResponse | null>(null);
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);
  function update(patch: Partial<typeof data>) {
    dataRef.current = { ...dataRef.current, ...patch }; setData(dataRef.current); setReview(null); setError(null);
  }
  function lineValue(index: number, patch: Partial<typeof data.lines[number]>) {
    update({ lines: dataRef.current.lines.map((line, i) => i === index ? { ...line, ...patch } : line) });
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current) return;
    if (!review) {
      const current = dataRef.current;
      const result = supplierQuoteResponseSchema.safeParse({ ...current, pricesIncludeTax: current.pricesIncludeTax === "true", leadTimeDays: current.leadTimeDays === "" ? undefined : Number(current.leadTimeDays) });
      if (!result.success || current.pricesIncludeTax === "") { setError("Completá la moneda, los impuestos, la vigencia, el plazo y todos los renglones. Indicá 0 cuando no corresponda un impuesto o descuento."); return; }
      if (internal && current.currency !== "ARS" && !fxRef.current.trim()) { setError("Completá el tipo de cambio antes de revisar."); return; }
      setError(null); setReview(result.data); return;
    }
    running.current = true; setPending(true); setError(null);
    try {
      const result = await onSubmit(review, fxRef.current);
      if (result.error) setError(result.error);
    } catch { setError("No pudimos confirmar la operación. Intentá de nuevo; el reintento conserva esta respuesta."); }
    finally { running.current = false; setPending(false); }
  }
  return <form onSubmit={submit} className={`space-y-5 ${PROCUREMENT_FORM_FIELDS_CLASS}`}>
    <div className="rounded-lg border bg-muted/30 p-4 text-sm">
      <p className="font-medium">{snapshot.companyName} · {snapshot.projectName}</p>
      <p className="mt-1 break-words">{snapshot.requestCode} · {snapshot.supplierName}</p>
      <p className="mt-2 text-muted-foreground">{internal ? "Revisá la respuesta original y ajustá los datos que correspondan. La evidencia enviada por el proveedor se conserva." : "Completá tu oferta para los ítems solicitados. Compras la revisará; enviarla no confirma una orden de compra."}</p>
    </div>
    {review && <div role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm"><p className="font-semibold">Revisá los datos antes de confirmar</p><p className="mt-1">{internal ? "Se incorporará una cotización recibida para comparar. No se adjudicará ni se creará una orden." : "Sólo podés enviar una respuesta por enlace. Si necesitás corregirla después, pedí un nuevo enlace a Compras."}</p></div>}
    <fieldset disabled={pending || !!review} className="min-w-0 space-y-5">
      <legend className="sr-only">Condiciones de la cotización</legend>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor={`${prefix}-currency`}>Moneda</Label><CurrencySelect id={`${prefix}-currency`} value={data.currency} disabled={pending || !!review} onValueChange={currency => update({ currency })} triggerClassName="min-w-0" /></div>
        <div className="space-y-1"><Label htmlFor={`${prefix}-tax`}>Precios unitarios</Label><Select value={data.pricesIncludeTax} disabled={pending || !!review} onValueChange={pricesIncludeTax => update({ pricesIncludeTax })}><SelectTrigger id={`${prefix}-tax`}><SelectValue placeholder="Indicá si incluyen IVA" /></SelectTrigger><SelectContent><SelectItem value="false">Sin IVA incluido</SelectItem><SelectItem value="true">Con IVA incluido</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><Label htmlFor={`${prefix}-iibb`}>Percepción IIBB (%)</Label><DecimalInput id={`${prefix}-iibb`} required precision={4} value={data.iibbPerceptionRate} onValueChange={iibbPerceptionRate => update({ iibbPerceptionRate })} /><p className="text-xs text-muted-foreground">Indicá 0 si no corresponde.</p></div>
        <div className="space-y-1"><Label htmlFor={`${prefix}-days`}>Plazo de entrega (días)</Label><Input id={`${prefix}-days`} type="number" min={0} max={3650} step={1} required value={data.leadTimeDays} onChange={e => update({ leadTimeDays: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor={`${prefix}-date`}>Oferta válida hasta</Label><Input id={`${prefix}-date`} type="date" required value={data.validUntil} onChange={e => update({ validUntil: e.target.value })} /></div>
        {internal && data.currency && <ManualFxField id={`${prefix}-fx`} currency={data.currency} value={fxRate} disabled={pending || !!review} onValueChange={value => { fxRef.current = value; setFxRate(value); setReview(null); }} />}
      </div>
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Ítems solicitados</h2>
        <p className="text-sm text-muted-foreground">Usá «No cotizado» si no ofrecés un ítem. Para «No cotizado» o «Bonificado», indicá precio cero y descuento cero. Debe haber al menos un ítem con precio positivo.</p>
        {snapshot.lines.map((line, index) => <section key={line.id} className="min-w-0 space-y-3 rounded-lg border p-4" aria-label={`Ítem ${index + 1}`}>
          <div><h3 className="break-words text-sm font-medium">{index + 1}. {line.description}</h3><p className="mt-1 text-sm text-muted-foreground">Cantidad solicitada: {formatQtyFromString(line.quantity)} {line.unit}</p></div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1"><Label htmlFor={`${prefix}-offer-${index}`}>Oferta</Label><Select value={data.lines[index]!.offerKind} disabled={pending || !!review} onValueChange={value => lineValue(index, { offerKind: value as SupplierQuoteResponse["lines"][number]["offerKind"] })}><SelectTrigger id={`${prefix}-offer-${index}`}><SelectValue /></SelectTrigger><SelectContent>{QUOTE_LINE_OFFER_KINDS.map(kind => <SelectItem key={kind} value={kind}>{QUOTE_LINE_OFFER_LABELS[kind]}</SelectItem>)}</SelectContent></Select></div>
            {([['unitPrice', 'Precio unitario'], ['taxRate', 'IVA (%)'], ['discountPct', 'Descuento (%)']] as const).map(([field, label]) => <div key={field} className="space-y-1"><Label htmlFor={`${prefix}-${field}-${index}`}>{label}</Label><DecimalInput id={`${prefix}-${field}-${index}`} required precision={4} value={data.lines[index]![field]} onValueChange={value => lineValue(index, { [field]: value })} /></div>)}
          </div>
        </section>)}
      </div>
      <div className="space-y-1"><Label htmlFor={`${prefix}-notes`}>Observaciones (opcional)</Label><AutoGrowTextarea id={`${prefix}-notes`} maxLength={2000} value={data.notes} onChange={e => update({ notes: e.target.value })} /><p className="text-xs text-muted-foreground">Hasta 2000 caracteres. No incluyas claves ni datos bancarios.</p></div>
    </fieldset>
    {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    <div className={PROCUREMENT_FORM_ACTIONS_CLASS}>
      {onCancel && <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>Cerrar revisión</Button>}
      {review && <Button type="button" variant="outline" disabled={pending} onClick={() => { setReview(null); setError(null); }}>Volver a editar</Button>}
      <Button type="submit" disabled={pending}>{pending ? "Guardando…" : !review ? "Revisar respuesta" : internal ? "Incorporar cotización" : "Confirmar y enviar respuesta"}</Button>
    </div>
  </form>;
}
