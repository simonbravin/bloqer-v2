"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SearchableCombobox,
  SEARCHABLE_NONE,
  toSearchableOptions,
  withNoneOption,
} from "@/components/ui/searchable-combobox";
import { cn } from "@/lib/utils";
import { InvoiceLinesEditor } from "@/features/ap/components/invoice-lines-editor";
import type { InvoiceLine } from "@/features/ap/components/invoice-lines-editor";
import { DocumentUploadZone } from "@/features/documents/components/document-upload-zone";
import { uploadDocumentAction } from "@/features/documents/upload-document-action";
import { registerTransactionAction } from "@/app/(app)/finanzas/transacciones/actions";

export type SupplierOption = { id: string; label: string };
export type ClientOption = { id: string; label: string };
export type TreasuryAccountOption = { id: string; label: string; currency: string };

type TransactionKind = "AP_EXPENSE" | "AR_INCOME" | "TREASURY_INFLOW";
type InflowMode = "AR_INVOICE" | "CASH_ONLY";

type TraceLink = { entityType: string; entityId: string };

interface Props {
  suppliers: SupplierOption[];
  clients?: ClientOption[];
  treasuryAccounts: TreasuryAccountOption[];
  canAp: boolean;
  canTreasury: boolean;
  /** EDIT AR — corporate SalesInvoice / Receivable (D-051). */
  canAr?: boolean;
  /** Abre el diálogo al montar (p. ej. /finanzas/transacciones?register=ap). */
  defaultOpen?: boolean;
  /** Storage ready for optional attachment on create (AP/AR invoice). */
  storageConfigured?: boolean;
}

const DEFAULT_LINE: InvoiceLine = { description: "", quantity: "1", unitPrice: "", taxRate: "21" };

function findTraceEntityId(chain: TraceLink[], entityType: string): string | null {
  return chain.find((l) => l.entityType === entityType)?.entityId ?? null;
}

function SegmentedOption({
  active,
  onClick,
  children,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        disabled && "pointer-events-none opacity-50",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function NewTransactionDialog({
  suppliers,
  clients = [],
  treasuryAccounts,
  canAp,
  canTreasury,
  canAr = false,
  defaultOpen = false,
  storageConfigured = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(defaultOpen);
  const [kind, setKind] = useState<TransactionKind>(canAp ? "AP_EXPENSE" : canAr ? "AR_INCOME" : "TREASURY_INFLOW");
  const [inflowMode, setInflowMode] = useState<InflowMode>(canAr ? "AR_INVOICE" : "CASH_ONLY");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);

  const [supplierContactId, setSupplierContactId] = useState("");
  const [clientContactId, setClientContactId] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([{ ...DEFAULT_LINE }]);
  const [payNow, setPayNow] = useState(false);
  const [collectNow, setCollectNow] = useState(false);
  const [payAccountId, setPayAccountId] = useState("");
  const [collectAccountId, setCollectAccountId] = useState("");

  const [inflowAccountId, setInflowAccountId] = useState("");
  const [counterpartyContactId, setCounterpartyContactId] = useState<string | null>(null);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  function clearRegisterQueryParam() {
    if (searchParams.get("register") !== "ap") return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("register");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const treasuryOptions = useMemo(
    () => toSearchableOptions(treasuryAccounts.map((a) => ({ id: a.id, label: a.label }))),
    [treasuryAccounts],
  );

  const clientOptionsRequired = useMemo(() => toSearchableOptions(clients), [clients]);

  const clientOptionsOptional = useMemo(
    () =>
      withNoneOption(toSearchableOptions(clients), {
        label: "Sin cliente / contraparte",
      }),
    [clients],
  );

  const showIncomeTab = canAr || canTreasury;
  if (!canAp && !showIncomeTab) return null;

  function resetForm() {
    setError(null);
    setAttachment(null);
    setSupplierContactId("");
    setClientContactId("");
    setLines([{ ...DEFAULT_LINE }]);
    setPayNow(false);
    setCollectNow(false);
    setPayAccountId("");
    setCollectAccountId("");
    setInflowAccountId("");
    setCounterpartyContactId(null);
    setInflowMode(canAr ? "AR_INVOICE" : "CASH_ONLY");
  }

  function selectIncomeTab() {
    if (canAr) {
      setKind("AR_INCOME");
      setInflowMode("AR_INVOICE");
    } else {
      setKind("TREASURY_INFLOW");
      setInflowMode("CASH_ONLY");
    }
    setLines([{ ...DEFAULT_LINE }]);
    setAttachment(null);
    setError(null);
  }

  function selectApTab() {
    setKind("AP_EXPENSE");
    setLines([{ ...DEFAULT_LINE }]);
    setAttachment(null);
    setError(null);
  }

  function handleInflowModeChange(mode: InflowMode) {
    setInflowMode(mode);
    setKind(mode === "AR_INVOICE" ? "AR_INCOME" : "TREASURY_INFLOW");
    setLines([{ ...DEFAULT_LINE }]);
    setAttachment(null);
    setError(null);
  }

  const wantsAttachment = Boolean(attachment && storageConfigured);
  const pendingAttachment = attachment;

  async function uploadInvoiceAttachment(opts: {
    file: File;
    linkedEntityType: "SUPPLIER_INVOICE" | "SALES_INVOICE";
    invoiceId: string;
    detailPath: string;
    paidOrCollected: boolean;
  }): Promise<boolean> {
    const fd = new FormData();
    fd.set("file", opts.file);
    fd.set("linkedEntityType", opts.linkedEntityType);
    fd.set("linkedEntityId", opts.invoiceId);
    fd.set("category", "INVOICE");
    fd.set("revalidatePaths", JSON.stringify([opts.detailPath]));
    const uploadRes = await uploadDocumentAction(fd);
    if ("error" in uploadRes) {
      toast.warning(
        opts.paidOrCollected
          ? `Registrado, pero no se pudo adjuntar el archivo: ${uploadRes.error}. Podés reintentar desde el detalle.`
          : `Creado, pero no se pudo adjuntar el archivo: ${uploadRes.error}. Podés reintentar desde el detalle.`,
      );
      return false;
    }
    return true;
  }

  function finishAndNavigate(href: string) {
    setOpen(false);
    resetForm();
    clearRegisterQueryParam();
    router.refresh();
    router.push(href);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      if (kind === "AP_EXPENSE") {
        if (!supplierContactId) {
          setError("Debe seleccionar un proveedor");
          return;
        }
        if (lines.some((l) => !l.description.trim() || !l.quantity || !l.unitPrice)) {
          setError("Completá descripción, cantidad y precio en todas las líneas");
          return;
        }
        if (payNow && !payAccountId) {
          setError("Seleccioná la cuenta de pago");
          return;
        }
        const issueDate = fd.get("issueDate") as string;
        const dueDate = fd.get("dueDate") as string;
        const paymentDate = (fd.get("paymentDate") as string) || issueDate;
        const res = await registerTransactionAction({
          kind: "AP_EXPENSE",
          supplierContactId,
          issueDate,
          dueDate,
          currency: "ARS",
          notes: (fd.get("notes") as string) || null,
          internalNotes: null,
          lines: lines.map((l, i) => ({ ...l, sortOrder: i })),
          payNow: payNow
            ? {
                accountId: payAccountId,
                paymentDate,
                payFullBalance: true,
                notes: null,
              }
            : undefined,
        });
        if ("error" in res) {
          setError(res.error);
          return;
        }
        const invoiceId = findTraceEntityId(res.traceChain, "SupplierInvoice");
        const invoiceHref = invoiceId
          ? `/finanzas/facturas-proveedor/${invoiceId}`
          : null;
        if (wantsAttachment) {
          if (!invoiceId || !invoiceHref) {
            toast.warning(
              "Registrado, pero no se pudo vincular el comprobante. Podés adjuntarlo desde la factura.",
            );
          } else {
            await uploadInvoiceAttachment({
              file: pendingAttachment!,
              linkedEntityType: "SUPPLIER_INVOICE",
              invoiceId,
              detailPath: invoiceHref,
              paidOrCollected: payNow,
            });
          }
        }
        // Con adjunto (o intento), aterrizar en la factura donde viven los documentos — no en el pago.
        finishAndNavigate(wantsAttachment && invoiceHref ? invoiceHref : res.href);
        return;
      }

      if (kind === "AR_INCOME") {
        if (!clientContactId) {
          setError("Debe seleccionar un cliente");
          return;
        }
        if (lines.some((l) => !l.description.trim() || !l.quantity || !l.unitPrice)) {
          setError("Completá descripción, cantidad y precio en todas las líneas");
          return;
        }
        if (collectNow && !collectAccountId) {
          setError("Seleccioná la cuenta de cobro");
          return;
        }
        if (collectNow && !canTreasury) {
          setError("Sin permisos de tesorería para cobrar ahora");
          return;
        }
        const issueDate = fd.get("arIssueDate") as string;
        const dueDate = fd.get("arDueDate") as string;
        const collectionDate = (fd.get("collectionDate") as string) || issueDate;
        const res = await registerTransactionAction({
          kind: "AR_INCOME",
          clientContactId,
          issueDate,
          dueDate,
          currency: "ARS",
          notes: (fd.get("arNotes") as string) || null,
          internalNotes: null,
          externalInvoiceRef: ((fd.get("arExternalInvoiceRef") as string) || "").trim() || null,
          lines: lines.map((l, i) => ({ ...l, sortOrder: i })),
          collectNow: collectNow
            ? {
                accountId: collectAccountId,
                collectionDate,
                collectFullBalance: true,
                notes: null,
              }
            : undefined,
        });
        if ("error" in res) {
          setError(res.error);
          return;
        }
        const invoiceId = findTraceEntityId(res.traceChain, "SalesInvoice");
        const receivableId = findTraceEntityId(res.traceChain, "Receivable");
        const detailPath = receivableId
          ? `/finanzas/cuentas-por-cobrar/${receivableId}`
          : res.href;
        if (wantsAttachment) {
          if (!invoiceId) {
            toast.warning(
              "Registrado, pero no se pudo vincular el comprobante. Podés adjuntarlo desde la cuenta por cobrar.",
            );
          } else {
            await uploadInvoiceAttachment({
              file: pendingAttachment!,
              linkedEntityType: "SALES_INVOICE",
              invoiceId,
              detailPath,
              paidOrCollected: collectNow,
            });
          }
        }
        finishAndNavigate(detailPath);
        return;
      }

      if (!inflowAccountId) {
        setError("Seleccioná la cuenta de tesorería");
        return;
      }
      const res = await registerTransactionAction({
        kind: "TREASURY_INFLOW",
        accountId: inflowAccountId,
        movementDate: fd.get("movementDate") as string,
        amount: fd.get("amount") as string,
        description: fd.get("description") as string,
        counterpartyContactId,
        externalInvoiceRef: ((fd.get("externalInvoiceRef") as string) || "").trim() || null,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      finishAndNavigate(res.href);
    });
  }

  const incomeTabActive = kind === "AR_INCOME" || kind === "TREASURY_INFLOW";
  const showInvoiceAttachment = storageConfigured && (kind === "AP_EXPENSE" || kind === "AR_INCOME");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        setOpen(next);
        if (!next) {
          resetForm();
          clearRegisterQueryParam();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Nueva transacción</Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-4xl"
        onInteractOutside={(e) => {
          if (isPending) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Registrar transacción</DialogTitle>
        </DialogHeader>

        <div
          className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-1"
          role="group"
          aria-label="Tipo de transacción"
        >
          {canAp && (
            <SegmentedOption active={kind === "AP_EXPENSE"} onClick={selectApTab} disabled={isPending}>
              Gasto / factura proveedor
            </SegmentedOption>
          )}
          {showIncomeTab && (
            <SegmentedOption active={incomeTabActive} onClick={selectIncomeTab} disabled={isPending}>
              Ingreso / cobro
            </SegmentedOption>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
          )}

          {kind === "AP_EXPENSE" && (
            <>
              <div className="space-y-1">
                <Label>Proveedor</Label>
                <SearchableCombobox
                  options={toSearchableOptions(suppliers)}
                  value={supplierContactId}
                  onValueChange={setSupplierContactId}
                  placeholder="Seleccionar proveedor..."
                  searchPlaceholder="Buscar proveedor..."
                  emptyText="Ningún proveedor coincide."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="issueDate">Fecha de emisión</Label>
                  <Input id="issueDate" name="issueDate" type="date" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dueDate">Vencimiento</Label>
                  <Input id="dueDate" name="dueDate" type="date" required />
                </div>
              </div>
              <InvoiceLinesEditor lines={lines} onChange={setLines} />
              <div className="space-y-1">
                <Label htmlFor="notes">Notas (opcional)</Label>
                <Textarea id="notes" name="notes" rows={2} />
              </div>
              {showInvoiceAttachment && (
                <div className="space-y-2">
                  <Label>Comprobante (opcional)</Label>
                  <p className="text-xs text-muted-foreground">
                    Foto o PDF de la factura. Se adjunta después de registrar.
                  </p>
                  <DocumentUploadZone
                    selectedFile={attachment}
                    onFileSelect={setAttachment}
                    onValidationError={setError}
                    disabled={isPending}
                  />
                </div>
              )}
              {canAp && canTreasury && treasuryAccounts.length > 0 && (
                <div className="rounded-md border p-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={payNow}
                      onChange={(e) => setPayNow(e.target.checked)}
                    />
                    Pagar ahora (egreso de caja)
                  </label>
                  {payNow && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 space-y-1">
                        <Label>Cuenta de pago</Label>
                        <SearchableCombobox
                          options={treasuryOptions}
                          value={payAccountId}
                          onValueChange={setPayAccountId}
                          placeholder="Cuenta..."
                          searchPlaceholder="Buscar cuenta..."
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="paymentDate">Fecha de pago</Label>
                        <Input id="paymentDate" name="paymentDate" type="date" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {incomeTabActive && (
            <>
              {canAr && canTreasury && (
                <div
                  className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-1"
                  role="group"
                  aria-label="Modo de ingreso"
                >
                  <SegmentedOption
                    active={inflowMode === "AR_INVOICE"}
                    onClick={() => handleInflowModeChange("AR_INVOICE")}
                    disabled={isPending}
                  >
                    Factura / cobro
                  </SegmentedOption>
                  <SegmentedOption
                    active={inflowMode === "CASH_ONLY"}
                    onClick={() => handleInflowModeChange("CASH_ONLY")}
                    disabled={isPending}
                  >
                    Solo ingreso a caja
                  </SegmentedOption>
                </div>
              )}

              {kind === "AR_INCOME" && (
                <>
                  <div className="space-y-1">
                    <Label>Cliente</Label>
                    <SearchableCombobox
                      options={clientOptionsRequired}
                      value={clientContactId}
                      onValueChange={setClientContactId}
                      placeholder="Seleccionar cliente..."
                      searchPlaceholder="Buscar cliente..."
                      emptyText="Ningún cliente coincide."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="arIssueDate">Fecha de emisión</Label>
                      <Input id="arIssueDate" name="arIssueDate" type="date" required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="arDueDate">Vencimiento</Label>
                      <Input id="arDueDate" name="arDueDate" type="date" required />
                    </div>
                  </div>
                  <InvoiceLinesEditor lines={lines} onChange={setLines} />
                  <div className="space-y-1">
                    <Label htmlFor="arExternalInvoiceRef">N° de comprobante externo (opcional)</Label>
                    <Input
                      id="arExternalInvoiceRef"
                      name="arExternalInvoiceRef"
                      placeholder="Ej. FC A 0001-00001234"
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="arNotes">Notas (opcional)</Label>
                    <Textarea id="arNotes" name="arNotes" rows={2} />
                  </div>
                  {showInvoiceAttachment && (
                    <div className="space-y-2">
                      <Label>Comprobante (opcional)</Label>
                      <p className="text-xs text-muted-foreground">
                        Foto o PDF de la factura. Se adjunta después de registrar.
                      </p>
                      <DocumentUploadZone
                        selectedFile={attachment}
                        onFileSelect={setAttachment}
                        onValidationError={setError}
                        disabled={isPending}
                      />
                    </div>
                  )}
                  {canTreasury && treasuryAccounts.length > 0 && (
                    <div className="rounded-md border p-3 space-y-3">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={collectNow}
                          onChange={(e) => setCollectNow(e.target.checked)}
                        />
                        Cobrar ahora (ingreso a caja)
                      </label>
                      {collectNow && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2 space-y-1">
                            <Label>Cuenta de cobro</Label>
                            <SearchableCombobox
                              options={treasuryOptions}
                              value={collectAccountId}
                              onValueChange={setCollectAccountId}
                              placeholder="Cuenta..."
                              searchPlaceholder="Buscar cuenta..."
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="collectionDate">Fecha de cobro</Label>
                            <Input id="collectionDate" name="collectionDate" type="date" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {kind === "TREASURY_INFLOW" && (
                <>
                  <div className="space-y-1">
                    <Label>Cuenta</Label>
                    <SearchableCombobox
                      options={treasuryOptions}
                      value={inflowAccountId}
                      onValueChange={setInflowAccountId}
                      placeholder="Seleccionar cuenta..."
                      searchPlaceholder="Buscar cuenta..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Cliente / contraparte (opcional)</Label>
                    <SearchableCombobox
                      options={clientOptionsOptional}
                      value={counterpartyContactId ?? SEARCHABLE_NONE}
                      onValueChange={(v) =>
                        setCounterpartyContactId(v === SEARCHABLE_NONE ? null : v)
                      }
                      placeholder="Sin cliente / contraparte"
                      searchPlaceholder="Buscar cliente..."
                      emptyText="Ningún cliente coincide."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="movementDate">Fecha</Label>
                      <Input id="movementDate" name="movementDate" type="date" required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="amount">Monto</Label>
                      <Input id="amount" name="amount" inputMode="decimal" required />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="externalInvoiceRef">N° de comprobante externo (opcional)</Label>
                    <Input
                      id="externalInvoiceRef"
                      name="externalInvoiceRef"
                      placeholder="Ej. FC A 0001-00001234"
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="description">Descripción</Label>
                    <Input id="description" name="description" required />
                  </div>
                </>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
