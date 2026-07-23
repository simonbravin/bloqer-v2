"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PurchaseOrderInvoiceDraftPreview } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableCombobox, SEARCHABLE_NONE, toSearchableOptions, withNoneOption } from "@/components/ui/searchable-combobox";
import { formatMoneyAmount } from "@/lib/format-money";
import { InvoiceLinesEditor } from "./invoice-lines-editor";
import type { InvoiceLine, InvoiceWbsOption } from "./invoice-lines-editor";
import { DocumentUploadZone } from "@/features/documents/components/document-upload-zone";
import { uploadDocumentAction } from "@/features/documents/upload-document-action";
import {
  createSupplierInvoiceAction,
  getPurchaseOrderInvoiceDraftPreviewAction,
  registerProjectApExpenseAction,
} from "@/app/(app)/proyectos/[id]/facturas-proveedor/actions";
import { createCompanySupplierInvoiceAction } from "@/app/(app)/finanzas/facturas-proveedor/actions";

export type SupplierOption = { id: string; label: string };
export type POOption = { id: string; code: string; supplierContactId: string; currency: string };
export type TreasuryAccountOption = { id: string; label: string; currency: string };

interface Props {
  /** Required when `companyFinanzas` is false */
  projectId?: string;
  companyFinanzas?: boolean;
  suppliers: SupplierOption[];
  poOptions?: POOption[];
  /** Project WBS items for line imputation ([D-055]). */
  wbsOptions?: InvoiceWbsOption[];
  /** Active treasury accounts for “pay now” (project only). */
  treasuryAccounts?: TreasuryAccountOption[];
  /** Show pay-now when user has EDIT TREASURY ([D-052]). */
  canPayNow?: boolean;
  /** Storage ready for optional attachment on create. */
  storageConfigured?: boolean;
  variant?: "card" | "plain";
  onCancel?: () => void;
  onSuccess?: () => void;
}

const DEFAULT_LINE: InvoiceLine = {
  description: "",
  quantity: "1",
  unitPrice: "",
  taxRate: "21",
  wbsNodeId: null,
};
const INVOICE_CURRENCY = "ARS";

export function SupplierInvoiceForm({
  projectId,
  companyFinanzas = false,
  suppliers,
  poOptions = [],
  wbsOptions = [],
  treasuryAccounts = [],
  canPayNow = false,
  storageConfigured = false,
  variant = "card",
  onCancel,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [supplierContactId, setSupplierContactId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([{ ...DEFAULT_LINE }]);
  const [payNow, setPayNow] = useState(false);
  const [payAccountId, setPayAccountId] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [poPreview, setPoPreview] = useState<PurchaseOrderInvoiceDraftPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const supportsPoPreview = Boolean(projectId) && !companyFinanzas;

  // Trae el estado de facturación de la OC (3-way match) al seleccionarla.
  useEffect(() => {
    if (!supportsPoPreview || !projectId || !purchaseOrderId) {
      setPoPreview(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPoPreview(null);
    getPurchaseOrderInvoiceDraftPreviewAction(projectId, purchaseOrderId)
      .then((res) => {
        if (cancelled) return;
        setPoPreview("error" in res ? null : res);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supportsPoPreview, projectId, purchaseOrderId]);

  function bringPoLines() {
    if (!poPreview || poPreview.lines.length === 0) return;
    setLines(
      poPreview.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
        wbsNodeId: l.wbsNodeId ?? null,
      })),
    );
    toast.success("Líneas traídas desde la OC (pendiente de facturar). Podés ajustarlas.");
  }

  const filteredPOs = poOptions.filter(
    (po) => !supplierContactId || po.supplierContactId === supplierContactId,
  );

  // Al cambiar de proveedor, descartar una OC vinculada que ya no le pertenece.
  useEffect(() => {
    if (purchaseOrderId && !filteredPOs.some((po) => po.id === purchaseOrderId)) {
      setPurchaseOrderId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierContactId]);

  const poComboboxOptions = useMemo(
    () =>
      withNoneOption(
        toSearchableOptions(filteredPOs.map((po) => ({ id: po.id, label: po.code }))),
        { label: "Sin OC vinculada" },
      ),
    [filteredPOs],
  );

  const compatibleAccounts = useMemo(
    () => treasuryAccounts.filter((a) => a.currency === INVOICE_CURRENCY),
    [treasuryAccounts],
  );
  const treasuryOptions = useMemo(
    () => toSearchableOptions(compatibleAccounts.map((a) => ({ id: a.id, label: a.label }))),
    [compatibleAccounts],
  );

  const showPayNow = Boolean(projectId) && !companyFinanzas && canPayNow;

  async function uploadAttachmentIfAny(invoiceId: string, scopeProjectId: string | null) {
    if (!attachment || !storageConfigured) return null;
    const fd = new FormData();
    fd.set("file", attachment);
    fd.set("linkedEntityType", "SUPPLIER_INVOICE");
    fd.set("linkedEntityId", invoiceId);
    fd.set("category", "INVOICE");
    if (scopeProjectId) fd.set("projectId", scopeProjectId);
    const detailPath = scopeProjectId
      ? `/proyectos/${scopeProjectId}/facturas-proveedor/${invoiceId}`
      : `/finanzas/facturas-proveedor/${invoiceId}`;
    fd.set("revalidatePaths", JSON.stringify([detailPath]));
    return uploadDocumentAction(fd);
  }

  function notifyAttachFailure(uploadError: string, paid: boolean) {
    toast.warning(
      paid
        ? `Factura emitida y pagada, pero no se pudo adjuntar el archivo: ${uploadError}. Podés reintentar desde el detalle.`
        : `Factura creada, pero no se pudo adjuntar el archivo: ${uploadError}. Podés reintentar desde el detalle.`,
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!supplierContactId) { setError("Debe seleccionar un proveedor"); return; }
    if (lines.some((l) => !l.description.trim() || !l.quantity || !l.unitPrice)) {
      setError("Completar descripción, cantidad y precio en todas las líneas");
      return;
    }
    if (projectId && !companyFinanzas && lines.some((l) => !l.wbsNodeId)) {
      setError("Cada línea debe imputar a una partida EDT");
      return;
    }
    if (payNow && showPayNow && !payAccountId) {
      setError("Seleccioná la cuenta de pago");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      if (companyFinanzas) {
        const res = await createCompanySupplierInvoiceAction({
          supplierContactId,
          issueDate:     fd.get("issueDate") as string,
          dueDate:       fd.get("dueDate") as string,
          currency:      INVOICE_CURRENCY,
          notes:         (fd.get("notes") as string) || null,
          internalNotes: null,
          lines:         lines.map((l, i) => ({ ...l, sortOrder: i })),
        });
        if ("error" in res) {
          setError(res.error);
          return;
        }
        const uploadRes = await uploadAttachmentIfAny(res.id, null);
        if (uploadRes && "error" in uploadRes) {
          notifyAttachFailure(uploadRes.error, false);
        }
        onSuccess?.();
        router.push(`/finanzas/facturas-proveedor/${res.id}`);
        return;
      }
      if (!projectId) {
        setError("Configuración inválida del formulario");
        return;
      }

      if (payNow && showPayNow) {
        const issueDate = fd.get("issueDate") as string;
        const paymentDate = (fd.get("paymentDate") as string) || issueDate;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
          setError("Fecha de pago inválida");
          return;
        }
        const res = await registerProjectApExpenseAction(projectId, {
          supplierContactId,
          issueDate,
          dueDate: fd.get("dueDate") as string,
          currency: INVOICE_CURRENCY,
          notes: (fd.get("notes") as string) || null,
          purchaseOrderId: purchaseOrderId ?? null,
          lines: lines.map((l, i) => ({ ...l, sortOrder: i })),
          payNow: {
            accountId: payAccountId,
            paymentDate,
            payFullBalance: true,
            notes: null,
          },
        });
        if ("error" in res) {
          setError(res.error);
          return;
        }
        const uploadRes = await uploadAttachmentIfAny(res.id, projectId);
        if (uploadRes && "error" in uploadRes) {
          notifyAttachFailure(uploadRes.error, true);
        }
        onSuccess?.();
        router.push(`/proyectos/${projectId}/facturas-proveedor/${res.id}`);
        return;
      }

      const res = await createSupplierInvoiceAction(projectId, {
        projectId,
        supplierContactId,
        issueDate:       fd.get("issueDate")  as string,
        dueDate:         fd.get("dueDate")    as string,
        currency:        INVOICE_CURRENCY,
        notes:           (fd.get("notes") as string) || null,
        internalNotes:   null,
        purchaseOrderId: purchaseOrderId ?? null,
        lines:           lines.map((l, i) => ({ ...l, sortOrder: i })),
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      const uploadRes = await uploadAttachmentIfAny(res.id, projectId);
      if (uploadRes && "error" in uploadRes) {
        notifyAttachFailure(uploadRes.error, false);
      }
      onSuccess?.();
      router.push(`/proyectos/${projectId}/facturas-proveedor/${res.id}`);
    });
  }

  return (
    <div className={variant === "card" ? "rounded-lg border bg-card p-6" : undefined}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
            <Label>Proveedor</Label>
            {suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay proveedores activos. Cree un contacto con rol Proveedor primero.
              </p>
            ) : (
              <SearchableCombobox
                options={toSearchableOptions(suppliers)}
                value={supplierContactId}
                onValueChange={setSupplierContactId}
                placeholder="Seleccionar proveedor…"
                searchPlaceholder="Buscar proveedor…"
                emptyText="Ningún proveedor coincide."
              />
            )}
          </div>

          {filteredPOs.length > 0 && !companyFinanzas && (
            <div className="col-span-2 space-y-1">
              <Label>Orden de compra (opcional)</Label>
              <SearchableCombobox
                options={poComboboxOptions}
                value={purchaseOrderId ?? SEARCHABLE_NONE}
                onValueChange={(v) =>
                  setPurchaseOrderId(v === SEARCHABLE_NONE ? null : v)
                }
                placeholder="Sin OC vinculada"
                searchPlaceholder="Buscar OC…"
              />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="issueDate">Fecha de emisión</Label>
            <Input id="issueDate" name="issueDate" type="date" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dueDate">Fecha de vencimiento</Label>
            <Input id="dueDate" name="dueDate" type="date" required />
          </div>
        </div>

        {supportsPoPreview && purchaseOrderId && (
          <PoBillingReference
            loading={previewLoading}
            preview={poPreview}
            onBringLines={bringPoLines}
          />
        )}

        <hr />

        <InvoiceLinesEditor
          lines={lines}
          onChange={setLines}
          requireWbs={Boolean(projectId) && !companyFinanzas}
          wbsOptions={wbsOptions}
        />

        <hr />

        <div className="space-y-1">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>

        {storageConfigured && (
          <div className="space-y-2">
            <Label>Comprobante (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              Foto o PDF de la factura. Se adjunta después de crear el documento.
            </p>
            <DocumentUploadZone
              selectedFile={attachment}
              onFileSelect={setAttachment}
              onValidationError={setError}
              disabled={isPending}
            />
          </div>
        )}

        {showPayNow && (
          <div className="rounded-md border p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={payNow}
                onChange={(e) => setPayNow(e.target.checked)}
                disabled={isPending}
              />
              Emitir y pagar ahora (egreso de caja)
            </label>
            <p className="text-xs text-muted-foreground">
              Emite la factura, crea la cuenta por pagar y registra el pago total en la misma operación.
              Sin esta opción se guarda como borrador.
            </p>
            {payNow && (
              compatibleAccounts.length === 0 ? (
                <p className="text-sm text-amber-800 dark:text-amber-200 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2">
                  No hay cuentas de tesorería activas en {INVOICE_CURRENCY}. Creá una caja o banco
                  en esa moneda para poder pagar ahora.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <Label>Cuenta de pago</Label>
                    <SearchableCombobox
                      options={treasuryOptions}
                      value={payAccountId}
                      onValueChange={setPayAccountId}
                      placeholder="Cuenta…"
                      searchPlaceholder="Buscar cuenta…"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="paymentDate">Fecha de pago</Label>
                    <Input id="paymentDate" name="paymentDate" type="date" required />
                  </div>
                </div>
              )
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel ?? (() => router.back())}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              isPending
              || suppliers.length === 0
              || (payNow && showPayNow && compatibleAccounts.length === 0)
            }
          >
            {isPending
              ? "Guardando…"
              : payNow && showPayNow
                ? "Emitir y pagar"
                : "Crear factura"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function PoBillingReference({
  loading,
  preview,
  onBringLines,
}: {
  loading: boolean;
  preview: PurchaseOrderInvoiceDraftPreview | null;
  onBringLines: () => void;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Cargando estado de facturación de la OC…
      </div>
    );
  }
  if (!preview) return null;

  const { summary, currency } = preview;
  const hasPending = preview.lines.length > 0 && Number.parseFloat(summary.pendingToInvoice) > 0;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">Estado de facturación de la OC (recibido vs. facturado)</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Se factura contra lo recibido (matching a 3 vías). Traé el pendiente y ajustá si hace falta.
        </p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span className="text-muted-foreground">
          Recibido: <span className="font-medium tabular-nums text-foreground">{formatMoneyAmount(summary.receivedAmount, currency)}</span>
        </span>
        <span className="text-muted-foreground">
          Facturado: <span className="font-medium tabular-nums text-foreground">{formatMoneyAmount(summary.invoicedAmount, currency)}</span>
        </span>
        <span className="text-muted-foreground">
          Pagado: <span className="font-medium tabular-nums text-foreground">{formatMoneyAmount(summary.paidAmount, currency)}</span>
        </span>
        <span className="text-muted-foreground">
          Pendiente de facturar:{" "}
          <span className="font-semibold tabular-nums text-foreground">{formatMoneyAmount(summary.pendingToInvoice, currency)}</span>
        </span>
      </div>
      {hasPending ? (
        <Button type="button" variant="outline" size="sm" onClick={onBringLines}>
          Traer líneas de la OC (pendiente de facturar)
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          {summary.hasReceivedQuantity
            ? "No hay saldo pendiente de facturar en esta OC."
            : "La OC aún no tiene cantidades recibidas para facturar."}
        </p>
      )}
    </div>
  );
}
