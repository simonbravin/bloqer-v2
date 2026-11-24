"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { listSupplierQuoteInvitations } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { toSearchableOptions } from "@/lib/searchable-options";
import { createSupplierQuoteLinkAction, importSupplierQuoteLinkAction, revokeSupplierQuoteLinkAction } from "@/app/(app)/proyectos/[id]/solicitudes-compra/actions";
import type { SupplierOption } from "./purchase-order-form";
import { SupplierQuoteResponseForm } from "./supplier-quote-response-form";
import { PROCUREMENT_FORM_FIELDS_CLASS, PROCUREMENT_FORM_PAGE_CLASS } from "../lib/procurement-form-layout";

type Invitation = Awaited<ReturnType<typeof listSupplierQuoteInvitations>>[number];
type Created = Exclude<Awaited<ReturnType<typeof createSupplierQuoteLinkAction>>, { error: string }>;
export function SupplierQuoteInvitationsPanel({ projectId, requestId, suppliers, invitations, allowCreate }: {
  projectId: string; requestId: string; suppliers: SupplierOption[]; invitations: Invitation[]; allowCreate: boolean;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Keep acknowledged mutations visible while the server-component refresh catches up.
  // These flags are set only after the server confirms the corresponding write.
  const [confirmedImports, setConfirmedImports] = useState<Set<string>>(() => new Set());
  const [confirmedRevocations, setConfirmedRevocations] = useState<Set<string>>(() => new Set());
  const running = useRef(false);
  const review = invitations.find(row => row.id === reviewId);
  const original = invitations.find(row => row.id === originalId);
  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setPending(true); setError(null); setNotice(null);
    try { await work(); } catch { setError("No pudimos completar la operación. Intentá de nuevo."); }
    finally { running.current = false; setPending(false); }
  }
  return <section aria-labelledby="supplier-links-title" className={`space-y-4 rounded-lg border p-4 sm:p-5 ${PROCUREMENT_FORM_PAGE_CLASS} ${PROCUREMENT_FORM_FIELDS_CLASS}`}>
    <div><h2 id="supplier-links-title" className="text-lg font-semibold">Respuestas por enlace</h2><p className="mt-1 text-sm text-muted-foreground">Compartí una solicitud con cada proveedor. Su respuesta queda pendiente de revisión por Compras.</p></div>
    {allowCreate && <div className="space-y-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1"><Label htmlFor="quote-link-supplier">Proveedor</Label><SearchableCombobox id="quote-link-supplier" options={toSearchableOptions(suppliers)} value={supplierId} onValueChange={setSupplierId} disabled={pending} placeholder="Elegí un proveedor" /></div>
        <Button className="min-h-11 shrink-0 md:min-h-10" disabled={pending || !supplierId} onClick={() => void run(async () => {
          const result = await createSupplierQuoteLinkAction(projectId, requestId, supplierId);
          if ("error" in result) { setError(result.error ?? "No pudimos crear el enlace."); return; }
          setConfirmedRevocations(previous => new Set([...previous, ...invitations.filter(row => row.supplierContactId === supplierId && !row.respondedAt && !row.revokedAt && !row.importedAt).map(row => row.id)]));
          setCreated(result); router.refresh();
        })}>{pending ? "Guardando…" : "Crear enlace"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">Válido por 7 días y revocable. Quien tenga el enlace podrá responder sin cuenta. Crear otro enlace para el mismo proveedor revoca el anterior pendiente. No se envían invitaciones automáticamente.</p>
    </div>}
    {created && <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <h3 className="text-sm font-semibold">Revisá qué vas a compartir</h3>
      <p className="break-words text-sm">{created.snapshot.companyName} · {created.snapshot.projectName} · {created.snapshot.requestCode} · {created.snapshot.supplierName}</p>
      <details className="text-sm"><summary className="cursor-pointer py-2">Ver los {created.snapshot.lines.length} ítems compartidos</summary><ul className="mt-2 space-y-2">{created.snapshot.lines.map(line => <li key={line.id} className="break-words">{line.description} · {line.quantity} {line.unit}</li>)}</ul></details>
      <p className="text-xs text-muted-foreground">No incluye presupuesto, ofertas de otros proveedores ni documentos internos. El enlace sólo se muestra al crearlo; guardalo para compartirlo.</p>
      <Label htmlFor="supplier-share-link">Enlace para el proveedor</Label><Input id="supplier-share-link" readOnly value={created.url} onFocus={e => e.target.select()} />
      <Button type="button" variant="outline" className="min-h-11" onClick={() => void run(async () => {
        try { await navigator.clipboard.writeText(created.url); setNotice("Enlace copiado."); }
        catch { setNotice("Seleccioná el enlace de arriba y copialo manualmente."); }
      })}>Copiar enlace</Button>
    </div>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!invitations.length && <p className="py-3 text-sm text-muted-foreground">Todavía no hay enlaces para esta solicitud.</p>}
    <ul className="space-y-3">{invitations.map(row => {
      const imported = Boolean(row.importedAt) || confirmedImports.has(row.id);
      const revoked = Boolean(row.revokedAt) || confirmedRevocations.has(row.id);
      const status = imported ? "Incorporada" : row.respondedAt ? "Respuesta recibida" : revoked ? "Revocado" : new Date(row.expiresAt).getTime() <= Date.now() ? "Vencido" : "Esperando respuesta";
      return <li key={row.id} className="flex min-w-0 flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1"><p className="break-words text-sm font-medium">{row.snapshot.supplierName}</p><Badge variant="secondary">{status}</Badge><p className="text-xs text-muted-foreground">Vence: {new Date(row.expiresAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}{revoked && row.respondedAt ? " · Acceso revocado" : ""}</p></div>
        <div className="flex flex-wrap gap-2">
          {row.response && <Button variant="ghost" disabled={pending} className="min-h-11" onClick={() => { setReviewId(null); setOriginalId(row.id); }}>Ver respuesta original</Button>}
          {row.response && !imported && allowCreate && <Button variant="outline" disabled={pending} className="min-h-11" onClick={() => { setOriginalId(null); setReviewId(row.id); }}>Revisar respuesta</Button>}
          {!revoked && !imported && <Button variant="ghost" disabled={pending} className="min-h-11" onClick={() => void run(async () => {
            const result = await revokeSupplierQuoteLinkAction(projectId, requestId, row.id);
            if ("error" in result) { setError(result.error); return; }
            setConfirmedRevocations(previous => new Set(previous).add(row.id));
            if (created?.id === row.id) setCreated(null);
            setNotice("Acceso revocado. Las respuestas recibidas se conservan."); router.refresh();
          })}>Revocar enlace</Button>}
        </div>
      </li>;
    })}</ul>
    {original?.response && <div className="space-y-4 border-t pt-5"><h3 className="font-semibold">Respuesta original del proveedor</h3><SupplierQuoteResponseForm key={`original-${original.id}`} snapshot={original.snapshot} initial={original.response} readOnly onCancel={() => setOriginalId(null)} onSubmit={async () => ({})} /></div>}
    {review?.response && <div className="space-y-4 border-t pt-5"><h3 className="font-semibold">Revisión de Compras</h3><SupplierQuoteResponseForm key={review.id} snapshot={review.snapshot} initial={review.response} internal onCancel={() => setReviewId(null)} onSubmit={async (response, fxRate) => {
      const result = await importSupplierQuoteLinkAction(projectId, requestId, review.id, response, fxRate);
      if ("error" in result) return result;
      setConfirmedImports(previous => new Set(previous).add(review.id));
      setReviewId(null); setNotice("Cotización incorporada. Ya podés compararla con las demás ofertas."); router.refresh(); return {};
    }} /></div>}
  </section>;
}
