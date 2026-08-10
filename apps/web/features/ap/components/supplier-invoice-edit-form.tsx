"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  requiresArInvoiceLetter,
  suggestInvoiceLetter,
  type InvoiceLetterCode,
  type IvaConditionCode,
} from "@bloqer/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableCombobox, SEARCHABLE_NONE, toSearchableOptions, withNoneOption } from "@/components/ui/searchable-combobox";
import {
  InvoiceLetterSelect,
  invoiceLetterHint,
} from "@/features/finance/components/invoice-letter-fields";
import { InvoiceLinesEditor } from "./invoice-lines-editor";
import type { InvoiceLine, InvoiceWbsOption } from "./invoice-lines-editor";
import { updateSupplierInvoiceAction } from "@/app/(app)/proyectos/[id]/facturas-proveedor/actions";
import { updateCompanySupplierInvoiceAction } from "@/app/(app)/finanzas/facturas-proveedor/actions";
import type { SupplierInvoiceView } from "@bloqer/services";
import type { SupplierOption, POOption } from "./supplier-invoice-form";

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
  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(invoice.purchaseOrderId ?? null);

  function onPurchaseOrderChange(nextId: string | null) {
    if (nextId === purchaseOrderId) return;
    setPurchaseOrderId(nextId);
    setLines((prev) => prev.map((l) => ({ ...l, purchaseOrderLineId: null })));
  }

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
      withNoneOption(
        toSearchableOptions(filteredPOs.map((po) => ({ id: po.id, label: po.code }))),
        { label: "Sin OC vinculada" },
      ),
    [filteredPOs],
  );
  const [lines, setLines] = useState<InvoiceLine[]>(
    invoice.lines.length > 0
      ? invoice.lines.map((l) => ({
          description: l.description,
          quantity:    l.quantity,
          unitPrice:   l.unitPrice,
          taxRate:     l.taxRate,
          wbsNodeId:   l.wbsNodeId,
          purchaseOrderLineId: l.purchaseOrderLineId,
        }))
      : [{ description: "", quantity: "1", unitPrice: "", taxRate: "21", wbsNodeId: null, purchaseOrderLineId: null }],
  );

  function handleSupplierChange(id: string) {
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
    const fd = new FormData(e.currentTarget);
    const payload = {
      supplierContactId,
      issueDate:       fd.get("issueDate") as string,
      dueDate:         fd.get("dueDate")   as string,
      // Only patch letter when AR gating is known; avoid wiping on failed country load.
      ...(showLetter ? { invoiceLetter } : {}),
      notes:           (fd.get("notes") as string) || null,
      purchaseOrderId: companyFinanzas ? null : purchaseOrderId ?? null,
      lines:           lines.map((l, i) => ({
        ...l,
        wbsNodeId: companyFinanzas ? null : l.wbsNodeId,
        purchaseOrderLineId: companyFinanzas ? null : l.purchaseOrderLineId,
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

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
            <Label>Proveedor</Label>
            <SearchableCombobox
              options={toSearchableOptions(suppliers)}
              value={supplierContactId}
              onValueChange={handleSupplierChange}
              placeholder="Seleccionar proveedor…"
              searchPlaceholder="Buscar proveedor…"
              emptyText="Ningún proveedor coincide."
            />
          </div>

          {showLetter ? (
            <div className="col-span-2">
              <InvoiceLetterSelect
                id="invoiceLetter"
                value={invoiceLetter}
                required
                onValueChange={(v) => {
                  setLetterTouched(true);
                  setInvoiceLetter(v);
                }}
                hint={invoiceLetterHint(invoiceLetter)}
              />
            </div>
          ) : null}

          {!companyFinanzas && filteredPOs.length > 0 && (
            <div className="col-span-2 space-y-1">
              <Label>Orden de compra (opcional)</Label>
              <SearchableCombobox
                options={poComboboxOptions}
                value={purchaseOrderId ?? SEARCHABLE_NONE}
                onValueChange={(v) =>
                  onPurchaseOrderChange(v === SEARCHABLE_NONE ? null : v)
                }
                placeholder="Sin OC vinculada"
                searchPlaceholder="Buscar OC…"
              />
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
