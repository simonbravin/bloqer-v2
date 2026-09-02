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
} from "@bloqer/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { CONTACT_PICKER_SEARCH_PLACEHOLDER, SEARCHABLE_NONE, toSearchableOptions, withNoneOption } from "@/lib/searchable-options";
import { AP_PAYEE_PICKER_HINT } from "../lib/ap-payee-options";
import { InvoiceLetterSelect, PricesIncludeTaxCheckbox } from "@/features/finance/components/invoice-letter-fields";
import { InvoiceLinesEditor } from "./invoice-lines-editor";
import type { InvoiceLine, InvoiceWbsOption } from "./invoice-lines-editor";
import { updateSupplierInvoiceAction } from "@/app/(app)/proyectos/[id]/facturas-proveedor/actions";
import { updateCompanySupplierInvoiceAction } from "@/app/(app)/finanzas/facturas-proveedor/actions";
import type { SupplierInvoiceView } from "@bloqer/services";
import type { SupplierOption, POOption } from "./supplier-invoice-form";
import { classifySupplierInvoice } from "@bloqer/domain";
import { DocumentClassCreateHint } from "@/features/finance/components/document-class-badge";
import { cn } from "@/lib/utils";

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
  const payeeLocked = Boolean(invoice.subcontractCertificationId);
  const [apSpendMode, setApSpendMode] = useState<"AGAINST_PO" | "DIRECT">(
    invoice.purchaseOrderId || invoice.lines.some((l) => l.purchaseOrderLineId)
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
    () =>
      apSpendMode === "AGAINST_PO"
        ? toSearchableOptions(filteredPOs.map((po) => ({ id: po.id, label: po.code })))
        : withNoneOption(
            toSearchableOptions(filteredPOs.map((po) => ({ id: po.id, label: po.code }))),
            { label: "Sin OC vinculada" },
          ),
    [filteredPOs, apSpendMode],
  );

  useEffect(() => {
    if (payeeLocked) return;
    if (purchaseOrderId && !filteredPOs.some((po) => po.id === purchaseOrderId)) {
      setPurchaseOrderId(null);
      setLines((prev) => prev.map((l) => ({ ...l, purchaseOrderLineId: null })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierContactId]);

  function handleSupplierChange(id: string) {
    if (payeeLocked) return;
    setSupplierContactId(id);
    if (letterTouched) return;
    const supplier = suppliers.find((s) => s.id === id);
    setInvoiceLetter(
      suggestInvoiceLetter({
        issuerIvaCondition: (supplier?.ivaCondition as IvaConditionCode | null | undefined) ?? null,
        receiverIvaCondition: (companyIvaCondition as IvaConditionCode | null) ?? null,
        receiverCountry: companyCountry,
      }),
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (showLetter && !invoiceLetter) {
      setError("Seleccioná el tipo de factura (A, B, C o E) antes de guardar");
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
    const fd = new FormData(e.currentTarget);
    const forceZeroTax = invoiceLetter === "C" || invoiceLetter === "E";
    const payload = {
      supplierContactId: payeeLocked ? invoice.supplierContactId : supplierContactId,
      issueDate:       fd.get("issueDate") as string,
      dueDate:         fd.get("dueDate")   as string,
      // Only patch letter when AR gating is known; avoid wiping on failed country load.
      ...(showLetter ? { invoiceLetter } : {}),
      pricesIncludeTax: forceZeroTax ? false : pricesIncludeTax,
      notes:           (fd.get("notes") as string) || null,
      purchaseOrderId: companyFinanzas || apSpendMode === "DIRECT" ? null : purchaseOrderId ?? null,
      lines:           lines.map((l, i) => ({
        ...l,
        taxRate: forceZeroTax ? "0" : l.taxRate,
        wbsNodeId: companyFinanzas ? null : l.wbsNodeId,
        purchaseOrderLineId:
          companyFinanzas || apSpendMode === "DIRECT" ? null : l.purchaseOrderLineId,
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

  return (
    <div className="rounded-lg border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <DocumentClassCreateHint
          classLabel={derivedClass.classLabel}
          classFamily={derivedClass.family}
          hint={
            payeeLocked
              ? "Vinculada a certificación de subcontrato."
              : companyFinanzas || !projectId
                ? "Gasto de estructura (sin obra)."
                : apSpendMode === "AGAINST_PO"
                  ? "Baja el comprometido abierto de esa OC."
                  : "No reduce el comprometido. Imputá partida y tipo de costo."
          }
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
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
                Esta factura nace de una certificación de subcontrato; el destinatario no se cambia acá.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{AP_PAYEE_PICKER_HINT}</p>
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
              <PricesIncludeTaxCheckbox
                checked={pricesIncludeTax}
                onCheckedChange={setPricesIncludeTax}
                editModeHint
              />
            </div>
          ) : (
            <div className="col-span-2">
              <PricesIncludeTaxCheckbox
                checked={pricesIncludeTax}
                onCheckedChange={setPricesIncludeTax}
                editModeHint
              />
            </div>
          )}

          {!companyFinanzas && projectId && (
            <div className="col-span-2 space-y-2">
              <Label>Imputación de costo</Label>
              {payeeLocked ? (
                <p className="text-xs text-muted-foreground">
                  Subcontrato: la clase queda fija; no se cambia a OC ni a costo directo.
                </p>
              ) : (
                <>
                  <div
                    className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-1"
                    role="group"
                    aria-label="Contra OC o costo directo"
                  >
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => selectApSpendMode("AGAINST_PO")}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        apSpendMode === "AGAINST_PO"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Contra orden de compra
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => selectApSpendMode("DIRECT")}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        apSpendMode === "DIRECT"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Costo directo
                    </button>
                  </div>
                  {apSpendMode === "AGAINST_PO" && (
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
          )}

          <div className="space-y-1">
            <Label htmlFor="issueDate">Fecha de emisión</Label>
            <Input
              id="issueDate" name="issueDate" type="date" required
              defaultValue={toDateStr(invoice.issueDate)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dueDate">Fecha de vencimiento</Label>
            <Input
              id="dueDate" name="dueDate" type="date" required
              defaultValue={toDateStr(invoice.dueDate)}
            />
          </div>
        </div>

        <hr />
        <InvoiceLinesEditor
          lines={lines}
          onChange={setLines}
          requireWbs={!companyFinanzas && Boolean(projectId)}
          wbsOptions={wbsOptions}
          pricesIncludeTax={pricesIncludeTax}
        />

        <div className="space-y-1">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea id="notes" name="notes" rows={2} defaultValue={invoice.notes ?? ""} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}
