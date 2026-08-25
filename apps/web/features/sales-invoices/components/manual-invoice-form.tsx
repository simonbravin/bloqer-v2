"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requiresArInvoiceLetter, suggestInvoiceLetter, defaultTaxRateForInvoiceLetter, evaluateInvoiceLetterTaxConsistency, isZeroIvaRate, type InvoiceLetterCode, type IvaConditionCode, invoiceLetterHint } from "@bloqer/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { toSearchableOptions } from "@/lib/searchable-options";
import { DocumentUploadZone } from "@/features/documents/components/document-upload-zone";
import { uploadDocumentAction } from "@/features/documents/upload-document-action";
import { InvoiceLetterSelect, PricesIncludeTaxCheckbox, TaxRateSelect } from "@/features/finance/components/invoice-letter-fields";
import { SettlementFields } from "@/features/treasury/components/settlement-fields";
import type { SettlementMethodValue } from "@/features/treasury/lib/settlement-method-label";
import {
  createSalesInvoiceAction,
  registerProjectArSaleAction,
} from "@/app/(app)/proyectos/[id]/facturas/actions";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";

export type ClientOption = {
  id: string;
  label: string;
  country?: string;
  ivaCondition?: string | null;
};

export type TreasuryAccountOption = {
  id: string;
  label: string;
  currency: string;
};

interface Props {
  projectId: string;
  clients: ClientOption[];
  /** Emisor fiscal ([D-084]). */
  companyCountry?: string | null;
  companyIvaCondition?: string | null;
  treasuryAccounts?: TreasuryAccountOption[];
  /** Show emit+collect when user can EDIT TREASURY ([D-077]). */
  canCollectNow?: boolean;
  storageConfigured?: boolean;
  variant?: "card" | "plain";
  onCancel?: () => void;
  onSuccess?: () => void;
}

const INVOICE_CURRENCY = "ARS";

export function ManualInvoiceForm({
  projectId,
  clients,
  companyCountry = null,
  companyIvaCondition = null,
  treasuryAccounts = [],
  canCollectNow = false,
  storageConfigured = false,
  variant = "card",
  onCancel,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clientContactId, setClientContactId] = useState("");
  const [invoiceLetter, setInvoiceLetter] = useState<InvoiceLetterCode | null>(null);
  const [letterTouched, setLetterTouched] = useState(false);
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [pricesIncludeTaxTouched, setPricesIncludeTaxTouched] = useState(false);
  const [taxRate, setTaxRate] = useState("21");
  const [quantity, setQuantity] = useState("1.00");
  const [unitPrice, setUnitPrice] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [collectNow, setCollectNow] = useState(false);
  const [collectAccountId, setCollectAccountId] = useState("");
  const [collectMethod, setCollectMethod] = useState<SettlementMethodValue | "">("");
  const { idempotencyKey: saleKey, rotateIdempotencyKey: rotateSaleKey } = useIdempotencyKey();
  const { idempotencyKey: collectNowKey, rotateIdempotencyKey: rotateCollectNowKey } = useIdempotencyKey();
  const { idempotencyKey: attachmentKey, rotateIdempotencyKey: rotateAttachmentKey } = useIdempotencyKey();

  useEffect(() => {
    rotateAttachmentKey();
  }, [attachment, rotateAttachmentKey]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientContactId),
    [clients, clientContactId],
  );

  const showLetter = requiresArInvoiceLetter(companyCountry, selectedClient?.country ?? null);

  useEffect(() => {
    if (!clientContactId || letterTouched) return;
    const suggested = suggestInvoiceLetter({
      issuerIvaCondition: (companyIvaCondition as IvaConditionCode | null) ?? null,
      receiverIvaCondition: (selectedClient?.ivaCondition as IvaConditionCode | null | undefined) ?? null,
      receiverCountry: selectedClient?.country,
    });
    setInvoiceLetter(suggested);
    if (suggested) setTaxRate(defaultTaxRateForInvoiceLetter(suggested));
  }, [clientContactId, companyIvaCondition, selectedClient, letterTouched]);

  useEffect(() => {
    if (pricesIncludeTaxTouched) return;
    setPricesIncludeTax(invoiceLetter === "B");
  }, [invoiceLetter, pricesIncludeTaxTouched]);

  const showCollectNow = canCollectNow;
  const compatibleAccounts = useMemo(
    () => treasuryAccounts.filter((a) => a.currency === INVOICE_CURRENCY),
    [treasuryAccounts],
  );
  const treasuryOptions = useMemo(
    () => toSearchableOptions(compatibleAccounts.map((a) => ({ id: a.id, label: a.label }))),
    [compatibleAccounts],
  );

  async function uploadAttachmentIfAny(invoiceId: string) {
    if (!attachment || !storageConfigured) return null;
    const detailPath = `/proyectos/${projectId}/facturas/${invoiceId}`;
    const fd = new FormData();
    fd.set("file", attachment);
    fd.set("linkedEntityType", "SALES_INVOICE");
    fd.set("linkedEntityId", invoiceId);
    fd.set("category", "INVOICE");
    fd.set("projectId", projectId);
    fd.set("revalidatePaths", JSON.stringify([detailPath]));
    fd.set("idempotencyKey", attachmentKey);
    return uploadDocumentAction(fd);
  }

  function notifyAttachFailure(uploadError: string, collected: boolean) {
    toast.warning(
      collected
        ? `Factura emitida y cobrada, pero no se pudo adjuntar el archivo: ${uploadError}. Podés reintentar desde el detalle.`
        : `Factura creada, pero no se pudo adjuntar el archivo: ${uploadError}. Podés reintentar desde el detalle.`,
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!clientContactId) { setError("Debe seleccionar un cliente"); return; }
    if (showLetter && !invoiceLetter) {
      setError("Seleccioná el tipo de factura (A, B, C o E)");
      return;
    }
    if (collectNow && showCollectNow && !collectAccountId) {
      setError("Seleccioná la cuenta de cobro");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      if (collectNow && showCollectNow) {
        const issueDate = fd.get("issueDate") as string;
        const collectionDate = (fd.get("collectionDate") as string) || issueDate;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(collectionDate)) {
          setError("Fecha de cobro inválida");
          return;
        }
        const forceZeroTax = invoiceLetter === "C" || invoiceLetter === "E";
        const res = await registerProjectArSaleAction(projectId, {
          projectId,
          idempotencyKey: saleKey,
          clientContactId,
          issueDate,
          dueDate: fd.get("dueDate") as string,
          currency: INVOICE_CURRENCY,
          invoiceLetter: showLetter ? invoiceLetter : null,
          pricesIncludeTax: forceZeroTax ? false : pricesIncludeTax,
          notes: (fd.get("notes") as string) || null,
          externalInvoiceRef: null,
          lines: [{
            description: fd.get("description") as string,
            quantity: String(fd.get("quantity") ?? "").trim() || quantity,
            unitPrice: String(fd.get("unitPrice") ?? "").trim() || unitPrice,
            taxRate: forceZeroTax ? "0" : (taxRate || "0"),
            sortOrder: 0,
          }],
          collectNow: {
            accountId: collectAccountId,
            collectionDate,
            collectFullBalance: true,
            notes: null,
            paymentMethod: collectMethod || null,
            reference: String(fd.get("reference") ?? "").trim() || null,
            idempotencyKey: collectNowKey,
          },
        });
        if ("error" in res) {
          setError(res.error);
          return;
        }
        rotateSaleKey();
        rotateCollectNowKey();
        const uploadRes = await uploadAttachmentIfAny(res.id);
        if (uploadRes && "error" in uploadRes) {
          notifyAttachFailure(uploadRes.error, true);
        }
        onSuccess?.();
        router.push(`/proyectos/${projectId}/facturas/${res.id}`);
        return;
      }

      const forceZeroTax = invoiceLetter === "C" || invoiceLetter === "E";
      const res = await createSalesInvoiceAction(projectId, {
        projectId,
        clientContactId,
        issueDate:  fd.get("issueDate")  as string,
        dueDate:    fd.get("dueDate")    as string,
        currency:   INVOICE_CURRENCY,
        invoiceLetter: showLetter ? invoiceLetter : null,
        pricesIncludeTax: forceZeroTax ? false : pricesIncludeTax,
        notes:      (fd.get("notes") as string) || null,
        externalInvoiceRef: null,
        lines: [{
          description: fd.get("description") as string,
          quantity:    String(fd.get("quantity") ?? "").trim() || quantity,
          unitPrice:   String(fd.get("unitPrice") ?? "").trim() || unitPrice,
          taxRate:     forceZeroTax ? "0" : (taxRate || "0"),
          sortOrder:   0,
        }],
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      const uploadRes = await uploadAttachmentIfAny(res.id);
      if (uploadRes && "error" in uploadRes) {
        notifyAttachFailure(uploadRes.error, false);
      }
      onSuccess?.();
      router.push(`/proyectos/${projectId}/facturas/${res.id}`);
    });
  }

  return (
    <div className={variant === "card" ? "rounded-lg border bg-card p-6" : undefined}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
            <Label>Cliente</Label>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay clientes activos en el directorio. Cree un contacto con rol Cliente primero.
              </p>
            ) : (
              <SearchableCombobox
                options={toSearchableOptions(clients)}
                value={clientContactId}
                onValueChange={(id) => {
                  setClientContactId(id);
                  setLetterTouched(false);
                }}
                placeholder="Seleccionar cliente…"
                searchPlaceholder="Buscar cliente…"
                emptyText="Ningún cliente coincide."
              />
            )}
          </div>

          {showLetter ? (
            <div className="col-span-2 space-y-3">
              <InvoiceLetterSelect
                id="invoiceLetter"
                value={invoiceLetter}
                required
                onValueChange={(v) => {
                  setLetterTouched(true);
                  setInvoiceLetter(v);
                  if (v) setTaxRate(defaultTaxRateForInvoiceLetter(v));
                  if (!pricesIncludeTaxTouched) setPricesIncludeTax(v === "B");
                }}
                hint={invoiceLetterHint(invoiceLetter)}
              />
              <PricesIncludeTaxCheckbox
                checked={pricesIncludeTax}
                onCheckedChange={(v) => {
                  setPricesIncludeTaxTouched(true);
                  setPricesIncludeTax(v);
                }}
              />
            </div>
          ) : (
            <div className="col-span-2">
              <PricesIncludeTaxCheckbox
                checked={pricesIncludeTax}
                onCheckedChange={(v) => {
                  setPricesIncludeTaxTouched(true);
                  setPricesIncludeTax(v);
                }}
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

        <hr />
        <p className="text-sm font-medium">Línea 1</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="description">Descripción</Label>
            <Input id="description" name="description" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="quantity">Cantidad</Label>
            <DecimalInput id="quantity" name="quantity" required value={quantity} onValueChange={setQuantity} placeholder="1,00" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="unitPrice">
              {pricesIncludeTax ? "Precio unitario (c/IVA)" : "Precio unitario"}
            </Label>
            <DecimalInput id="unitPrice" name="unitPrice" required value={unitPrice} onValueChange={setUnitPrice} placeholder="0,00" />
          </div>
          <div className="space-y-1">
            <TaxRateSelect
              id="taxRate"
              value={taxRate}
              onValueChange={setTaxRate}
              showConstructionHint
            />
            {evaluateInvoiceLetterTaxConsistency({
              invoiceLetter,
              taxAmount: isZeroIvaRate(taxRate) ? "0" : "1",
            }).map((i) => (
                <p
                  key={i.message}
                  className={
                    i.severity === "error"
                      ? "text-[11px] text-destructive"
                      : "text-[11px] text-amber-700 dark:text-amber-300"
                  }
                >
                  {i.message}
                </p>
              ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="notes">Notas</Label>
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

        {showCollectNow && (
          <div className="rounded-md border p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={collectNow}
                onChange={(e) => setCollectNow(e.target.checked)}
                disabled={isPending}
              />
              Emitir y cobrar ahora (ingreso a caja)
            </label>
            <p className="text-xs text-muted-foreground">
              Emite la factura, crea la cuenta por cobrar y registra el cobro total en la misma
              operación. Sin esta opción se guarda como borrador.
            </p>
            {collectNow && (
              compatibleAccounts.length === 0 ? (
                <p className="text-sm text-amber-800 dark:text-amber-200 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2">
                  No hay cuentas de tesorería activas en {INVOICE_CURRENCY}. Creá una caja o banco
                  en esa moneda para poder cobrar ahora.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <Label>Cuenta de cobro</Label>
                    <SearchableCombobox
                      options={treasuryOptions}
                      value={collectAccountId}
                      onValueChange={setCollectAccountId}
                      placeholder="Cuenta…"
                      searchPlaceholder="Buscar cuenta…"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="collectionDate">Fecha de cobro</Label>
                    <Input id="collectionDate" name="collectionDate" type="date" required />
                  </div>
                  <div className="col-span-2">
                    <SettlementFields
                      idPrefix="project-collect-now"
                      paymentMethod={collectMethod}
                      onPaymentMethodChange={setCollectMethod}
                    />
                  </div>
                </div>
              )
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel ?? (() => router.back())}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              isPending
              || clients.length === 0
              || (collectNow && showCollectNow && compatibleAccounts.length === 0)
            }
          >
            {isPending
              ? "Guardando…"
              : collectNow && showCollectNow
                ? "Emitir y cobrar"
                : "Crear factura"}
          </Button>
        </div>
      </form>
    </div>
  );
}
