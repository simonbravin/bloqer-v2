"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  defaultTaxRateForInvoiceLetter,
  invoiceLetterHint,
  isZeroIvaRate,
  requiresArInvoiceLetter,
  suggestInvoiceLetter,
  type InvoiceLetterCode,
  type IvaConditionCode,
  DEFAULT_IIBB_PERCEPTION_RATE_PCT,
} from "@bloqer/domain";
import { InvoiceLetterSelect, PricesIncludeTaxCheckbox } from "@/features/finance/components/invoice-letter-fields";
import { ExpandableNotesField } from "@/features/finance/components/expandable-notes-field";
import { InvoiceLinesEditor } from "./invoice-lines-editor";
import type { InvoiceLine, InvoiceWbsOption } from "./invoice-lines-editor";
import { updateSupplierInvoiceAction } from "@/app/(app)/proyectos/[id]/facturas-proveedor/actions";
import { updateCompanySupplierInvoiceAction } from "@/app/(app)/finanzas/facturas-proveedor/actions";
import type { SupplierInvoiceView } from "@bloqer/services";
import type { SupplierOption, POOption } from "./supplier-invoice-form";
import { classifySupplierInvoice } from "@bloqer/domain";
import {
  addDecimal,
  calcDocumentHeaderTaxTotals,
  compareDecimal,
  resolveDocumentLineAmounts,
  roundMoney,
} from "@bloqer/utils";
import { DocumentClassCreateHint } from "@/features/finance/components/document-class-badge";
import { formatMoneyAmount } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { CONTACT_PICKER_SEARCH_PLACEHOLDER, SEARCHABLE_NONE, toSearchableOptions } from "@/lib/searchable-options";

interface Props {
  /** Required when `companyFinanzas` is false */
  projectId?: string;
  companyFinanzas?: boolean;
  invoice: SupplierInvoiceView;
  suppliers: SupplierOption[];
  companyCountry?: string | null;
  companyIvaCondition?: string | null;
  poOptions?: POOption[];
  wbsOptions?: InvoiceWbsOption[];
  /** Parent open balance when editing a DRAFT credit note. */
  maxCreditAmount?: string | null;
}

function toDateStr(d: Date | string): string {
  return d instanceof Date ? d.toISOString().split("T")[0] : String(d).split("T")[0];
}

export function SupplierInvoiceEditForm({
  projectId,
  companyFinanzas = false,
  invoice,
  suppliers,
  companyCountry = null,
  companyIvaCondition = null,
  poOptions = [],
  wbsOptions = [],
  maxCreditAmount = null,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [supplierContactId, setSupplierContactId] = useState(invoice.supplierContactId);
  const [letterTouched, setLetterTouched] = useState(Boolean(invoice.invoiceLetter));
  const [invoiceLetter, setInvoiceLetter] = useState<InvoiceLetterCode | null>(
    (invoice.invoiceLetter as InvoiceLetterCode | null) ?? null,
  );
  /** Stored unit prices are net — keep off unless user re-enters gross ([D-086]). */
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(invoice.purchaseOrderId ?? null);
  const payeeLocked =
    Boolean(invoice.subcontractCertificationId) ||
    invoice.documentKind === "CREDIT_NOTE" ||
    invoice.documentKind === "DEBIT_NOTE";
  const certificationLocked = Boolean(invoice.subcontractCertificationId);
  const isFiscalNote =
    invoice.documentKind === "CREDIT_NOTE" || invoice.documentKind === "DEBIT_NOTE";
  const isCreditNote = invoice.documentKind === "CREDIT_NOTE";
  const [apSpendMode, setApSpendMode] = useState<"AGAINST_PO" | "DIRECT">(
    isFiscalNote
      ? "DIRECT"
      : invoice.purchaseOrderId || invoice.lines.some((l) => l.purchaseOrderLineId)
        ? "AGAINST_PO"
        : "DIRECT",
  );
  const [lines, setLines] = useState<InvoiceLine[]>(
    invoice.lines.length > 0
      ? invoice.lines.map((l) => ({
          description: l.description,
          quantity:    l.quantity,
          unitPrice:   l.unitPrice,
          taxRate:     l.taxRate,
          discountPct: l.discountPct ?? "0",
          wbsNodeId:   l.wbsNodeId,
          purchaseOrderLineId: l.purchaseOrderLineId,
          costAnalysisLineId: l.costAnalysisLineId ?? null,
          costType: (l.costType as InvoiceLine["costType"]) ?? "MATERIAL",
        }))
      : [{ description: "", quantity: "1", unitPrice: "", taxRate: "21", discountPct: "0", wbsNodeId: null, purchaseOrderLineId: null, costAnalysisLineId: null, costType: "MATERIAL" }],
  );
  const [iibbPerceptionRate, setIibbPerceptionRate] = useState(
    invoice.iibbPerceptionRate?.trim()
      ? invoice.iibbPerceptionRate
      : DEFAULT_IIBB_PERCEPTION_RATE_PCT,
  );

  function onPurchaseOrderChange(nextId: string | null) {
    if (nextId === purchaseOrderId) return;
    setPurchaseOrderId(nextId);
    if (nextId) setApSpendMode("AGAINST_PO");
    setLines((prev) => prev.map((l) => ({ ...l, purchaseOrderLineId: null })));
  }

  function selectApSpendMode(mode: "AGAINST_PO" | "DIRECT") {
    if (payeeLocked) return;
    setApSpendMode(mode);
    if (mode === "DIRECT") {
      setPurchaseOrderId(null);
      setLines((prev) => prev.map((l) => ({ ...l, purchaseOrderLineId: null })));
    }
  }

  const derivedClass = useMemo(() => {
    if (payeeLocked) {
      return classifySupplierInvoice({
        projectId: invoice.projectId,
        subcontractCertificationId: invoice.subcontractCertificationId,
      });
    }
    if (companyFinanzas || !projectId) {
      return classifySupplierInvoice({ projectId: null });
    }
    if (apSpendMode === "AGAINST_PO") {
      return classifySupplierInvoice({
        projectId,
        purchaseOrderId,
        hasPoLineLink: true,
      });
    }
    return classifySupplierInvoice({
      projectId,
      purchaseOrderId: null,
      hasPoLineLink: false,
    });
  }, [
    payeeLocked,
    invoice.projectId,
    invoice.subcontractCertificationId,
    companyFinanzas,
    projectId,
    apSpendMode,
    purchaseOrderId,
  ]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierContactId),
    [suppliers, supplierContactId],
  );
  const showLetter = requiresArInvoiceLetter(companyCountry, selectedSupplier?.country ?? null);

  const filteredPOs = poOptions.filter(
    (po) => !supplierContactId || po.supplierContactId === supplierContactId,
  );
  const poComboboxOptions = useMemo(
    () => toSearchableOptions(filteredPOs.map((po) => ({ id: po.id, label: po.code }))),
    [filteredPOs],
  );

  useEffect(() => {
    if (payeeLocked) return;
    if (purchaseOrderId && !filteredPOs.some((po) => po.id === purchaseOrderId)) {
      setPurchaseOrderId(null);
      setLines((prev) => prev.map((l) => ({ ...l, purchaseOrderLineId: null })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierContactId]);

  // Mirror create form: re-suggest letter/tax when payee changes and user has not overridden.
  useEffect(() => {
    if (payeeLocked || !supplierContactId || letterTouched) return;
    const suggested = suggestInvoiceLetter({
      issuerIvaCondition: (selectedSupplier?.ivaCondition as IvaConditionCode | null | undefined) ?? null,
      receiverIvaCondition: (companyIvaCondition as IvaConditionCode | null) ?? null,
      receiverCountry: companyCountry,
    });
    setInvoiceLetter(suggested);
    if (!suggested) return;
    const nextRate = defaultTaxRateForInvoiceLetter(suggested);
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        taxRate:
          suggested === "C" || suggested === "E"
            ? "0"
            : isZeroIvaRate(l.taxRate)
              ? nextRate
              : l.taxRate,
      })),
    );
  }, [
    payeeLocked,
    supplierContactId,
    selectedSupplier,
    companyIvaCondition,
    companyCountry,
    letterTouched,
  ]);

  function handleSupplierChange(id: string) {
    if (payeeLocked) return;
    setSupplierContactId(id);
    setLetterTouched(false);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (showLetter && !invoiceLetter) {
      setError("Seleccioná el comprobante (A, B, C o E) antes de guardar");
      return;
    }
    if (lines.some((l) => !l.description.trim() || !l.quantity || !l.unitPrice)) {
      setError("Completar descripción, cantidad y precio en todas las líneas");
      return;
    }
    if (!companyFinanzas && projectId && lines.some((l) => !l.wbsNodeId)) {
      setError("Cada línea debe imputar a una partida EDT");
      return;
    }
    if (
      !companyFinanzas &&
      projectId &&
      !payeeLocked &&
      apSpendMode === "AGAINST_PO" &&
      !purchaseOrderId
    ) {
      setError("Seleccioná la orden de compra o cambiá a costo directo");
      return;
    }
    const forceZeroTax = invoiceLetter === "C" || invoiceLetter === "E";
    const pricesIncludeTaxPayload = forceZeroTax ? false : pricesIncludeTax;
    const iibbForSave = isCreditNote ? "0" : iibbPerceptionRate;
    if (isCreditNote && maxCreditAmount) {
      try {
        let subtotal = "0";
        let taxAmount = "0";
        for (const line of lines) {
          const amounts = resolveDocumentLineAmounts({
            quantity: line.quantity || "0",
            unitPrice: line.unitPrice || "0",
            taxRatePercent: forceZeroTax ? "0" : line.taxRate || "0",
            discountPct: line.discountPct || "0",
            pricesIncludeTax: pricesIncludeTaxPayload,
          });
          subtotal = roundMoney(addDecimal(subtotal, amounts.lineSubtotal));
          taxAmount = roundMoney(addDecimal(taxAmount, amounts.lineTax));
        }
        const total = calcDocumentHeaderTaxTotals({
          subtotal,
          taxAmount,
          iibbPerceptionRatePercent: iibbForSave,
        }).totalAmount;
        if (compareDecimal(total, maxCreditAmount) > 0) {
          setError(
            `El total no puede superar el saldo pendiente (${formatMoneyAmount(maxCreditAmount, invoice.currency)}).`,
          );
          return;
        }
      } catch {
        setError("Revisá los montos de las líneas");
        return;
      }
    }
    const fd = new FormData(e.currentTarget);
    const clearPoLink = !payeeLocked && (companyFinanzas || apSpendMode === "DIRECT");
    const payload = {
      supplierContactId: payeeLocked ? invoice.supplierContactId : supplierContactId,
      issueDate:       fd.get("issueDate") as string,
      dueDate:         fd.get("dueDate")   as string,
      // Clear letter when AR gate is off (foreign supplier / non-AR company).
      invoiceLetter: showLetter ? invoiceLetter : null,
      pricesIncludeTax: pricesIncludeTaxPayload,
      notes:           (fd.get("notes") as string) || null,
      // Fiscal notes / certification: never rewrite PO linkage from the DIRECT UI path.
      ...(payeeLocked
        ? {}
        : {
            purchaseOrderId: clearPoLink ? null : purchaseOrderId ?? null,
          }),
      iibbPerceptionRate: iibbForSave,
      lines:           lines.map((l, i) => ({
        ...l,
        taxRate: forceZeroTax ? "0" : l.taxRate,
        wbsNodeId: companyFinanzas ? null : l.wbsNodeId,
        purchaseOrderLineId: payeeLocked
          ? l.purchaseOrderLineId
          : clearPoLink
            ? null
            : l.purchaseOrderLineId,
        sortOrder: i,
      })),
    };
    startTransition(async () => {
      const res = companyFinanzas
        ? await updateCompanySupplierInvoiceAction(invoice.id, payload)
        : await updateSupplierInvoiceAction(invoice.id, projectId!, payload);
      if ("error" in res) {
        setError(res.error);
      } else {
        router.push(
          companyFinanzas
            ? `/finanzas/facturas-proveedor/${invoice.id}`
            : `/proyectos/${projectId}/facturas-proveedor/${invoice.id}`,
        );
      }
    });
  }

  const classHint = certificationLocked
    ? "Vinculada a certificación de subcontrato."
    : isFiscalNote
      ? "Nota vinculada a la factura de referencia; el proveedor no se cambia."
      : companyFinanzas || !projectId
        ? "Gasto de estructura (sin obra)."
        : null;

  return (
    <div className="rounded-lg border bg-card p-5 sm:p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className={cn("space-y-1", showLetter ? "sm:col-span-4" : "sm:col-span-6")}>
            <Label>A quién se le paga</Label>
            <SearchableCombobox
              options={toSearchableOptions(suppliers)}
              value={supplierContactId}
              onValueChange={handleSupplierChange}
              disabled={payeeLocked}
              placeholder="Seleccionar proveedor o empleado…"
              searchPlaceholder={CONTACT_PICKER_SEARCH_PLACEHOLDER}
              emptyText="Ningún proveedor o empleado coincide."
              popoverWidth="wide"
            />
            {payeeLocked ? (
              <p className="text-xs text-muted-foreground">
                {certificationLocked
                  ? "Esta factura nace de una certificación de subcontrato; el destinatario no se cambia acá."
                  : "El proveedor viene de la factura de referencia y no se cambia acá."}
              </p>
            ) : null}
          </div>

          {showLetter ? (
            <InvoiceLetterSelect
              id="invoiceLetter"
              className="sm:col-span-2"
              value={invoiceLetter}
              required
              onValueChange={(v) => {
                setLetterTouched(true);
                setInvoiceLetter(v);
                if (v === "C" || v === "E") {
                  setPricesIncludeTax(false);
                }
                if (!v) return;
                const nextRate = defaultTaxRateForInvoiceLetter(v);
                setLines((prev) =>
                  prev.map((l) => ({
                    ...l,
                    taxRate:
                      v === "C" || v === "E"
                        ? "0"
                        : isZeroIvaRate(l.taxRate)
                          ? nextRate
                          : l.taxRate,
                  })),
                );
              }}
              hint={invoiceLetterHint(invoiceLetter)}
            />
          ) : null}

          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="issueDate">Fecha de emisión</Label>
            <Input
              id="issueDate" name="issueDate" type="date" required
              defaultValue={toDateStr(invoice.issueDate)}
            />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="dueDate">Fecha de vencimiento</Label>
            <Input
              id="dueDate" name="dueDate" type="date" required
              defaultValue={toDateStr(invoice.dueDate)}
            />
          </div>

          {!companyFinanzas && projectId ? (
            <>
              <div className="space-y-2 sm:col-span-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <Label>Imputación de costo</Label>
                  <DocumentClassCreateHint
                    variant="inline"
                    showPrefix={false}
                    classLabel={derivedClass.classLabel}
                    classFamily={derivedClass.family}
                  />
                </div>
                {payeeLocked ? (
                  classHint ? (
                    <p className="text-xs text-muted-foreground">{classHint}</p>
                  ) : null
                ) : (
                  <>
                    <div
                      className="inline-flex flex-wrap rounded-md border border-border bg-muted/40 p-1"
                      role="group"
                      aria-label="Contra OC o costo directo"
                    >
                      <button
                        type="button"
                        disabled={isPending}
                        aria-pressed={apSpendMode === "AGAINST_PO"}
                        onClick={() => selectApSpendMode("AGAINST_PO")}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm transition-colors",
                          apSpendMode === "AGAINST_PO"
                            ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                            : "font-medium text-muted-foreground hover:bg-background/80 hover:text-foreground",
                        )}
                      >
                        Contra orden de compra
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        aria-pressed={apSpendMode === "DIRECT"}
                        onClick={() => selectApSpendMode("DIRECT")}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm transition-colors",
                          apSpendMode === "DIRECT"
                            ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                            : "font-medium text-muted-foreground hover:bg-background/80 hover:text-foreground",
                        )}
                      >
                        Costo directo
                      </button>
                    </div>
                    {apSpendMode === "DIRECT" ? null : filteredPOs.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No hay OC confirmadas para este proveedor. Cambiá el payee o usá costo directo.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        <Label>Orden de compra</Label>
                        <SearchableCombobox
                          options={poComboboxOptions}
                          value={purchaseOrderId ?? SEARCHABLE_NONE}
                          onValueChange={(v) =>
                            onPurchaseOrderChange(v === SEARCHABLE_NONE ? null : v)
                          }
                          placeholder="Seleccionar OC…"
                          searchPlaceholder="Buscar OC…"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
              <PricesIncludeTaxCheckbox
                compact
                className="sm:col-span-3"
                checked={pricesIncludeTax}
                onCheckedChange={setPricesIncludeTax}
                editModeHint
              />
            </>
          ) : (
            <>
              <div className="space-y-1.5 sm:col-span-3">
                <DocumentClassCreateHint
                  variant="inline"
                  showPrefix={false}
                  classLabel={derivedClass.classLabel}
                  classFamily={derivedClass.family}
                />
                {classHint ? (
                  <p className="text-xs text-muted-foreground">{classHint}</p>
                ) : null}
              </div>
              <PricesIncludeTaxCheckbox
                compact
                className="sm:col-span-3"
                checked={pricesIncludeTax}
                onCheckedChange={setPricesIncludeTax}
                editModeHint
              />
            </>
          )}
        </div>

        <div className="border-t border-border/60 pt-4">
          {isFiscalNote && invoice.documentKind === "CREDIT_NOTE" && maxCreditAmount ? (
            <p className="mb-3 text-sm text-muted-foreground">
              Máximo para esta NC:{" "}
              <span className="font-mono font-medium">
                {formatMoneyAmount(maxCreditAmount, invoice.currency)}
              </span>{" "}
              (saldo pendiente de la factura de referencia).
            </p>
          ) : isFiscalNote && invoice.documentKind === "CREDIT_NOTE" ? (
            <p className="mb-3 text-sm text-muted-foreground">
              La NC no puede superar el saldo pendiente de la factura de referencia al emitir.
            </p>
          ) : null}
          <InvoiceLinesEditor
            lines={lines}
            onChange={setLines}
            requireWbs={!companyFinanzas && Boolean(projectId)}
            wbsOptions={wbsOptions}
            pricesIncludeTax={pricesIncludeTax}
            iibbPerceptionRate={isCreditNote ? undefined : iibbPerceptionRate}
            onIibbPerceptionRateChange={isCreditNote ? undefined : setIibbPerceptionRate}
          />
        </div>

        <ExpandableNotesField defaultValue={invoice.notes ?? ""} />

        <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}
