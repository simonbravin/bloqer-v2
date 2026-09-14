"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  requiresArInvoiceLetter,
  type InvoiceLetterCode,
  invoiceLetterHint,
  DEFAULT_IIBB_PERCEPTION_RATE_PCT,
  fiscalDocumentKindLabel,
} from "@bloqer/domain";
import {
  addDecimal,
  calcDocumentHeaderTaxTotals,
  calcExclusiveLineAmounts,
  compareDecimal,
  roundMoney,
} from "@bloqer/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InvoiceLetterSelect } from "@/features/finance/components/invoice-letter-fields";
import { ExpandableNotesField } from "@/features/finance/components/expandable-notes-field";
import { IibbPerceptionFields } from "@/features/finance/components/iibb-perception-fields";
import { formatMoneyAmount } from "@/lib/format-money";
import { updateSalesInvoiceAction } from "@/app/(app)/proyectos/[id]/facturas/actions";
import { updateCompanySalesInvoiceAction } from "@/app/(app)/finanzas/facturas/actions";

export type SalesNoteLineDraft = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  discountPct: string;
};

interface Props {
  projectId?: string;
  /** Corporate Finanzas AR (projectId null). */
  companyFinanzas?: boolean;
  invoiceId: string;
  companyCountry?: string | null;
  clientCountry?: string | null;
  /** When set, lines are editable (DRAFT NC/ND only). */
  documentKind?: string | null;
  /** Parent open balance when editing a DRAFT credit note. */
  maxCreditAmount?: string | null;
  currency?: string;
  defaults: {
    issueDate: string;
    dueDate: string;
    notes: string;
    internalNotes: string;
    invoiceLetter: InvoiceLetterCode | null;
    iibbPerceptionRate?: string;
    subtotal?: string;
    lines?: SalesNoteLineDraft[];
  };
}

export function InvoiceEditForm({
  projectId,
  companyFinanzas = false,
  invoiceId,
  companyCountry,
  clientCountry,
  documentKind,
  maxCreditAmount = null,
  currency = "ARS",
  defaults,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [invoiceLetter, setInvoiceLetter] = useState<InvoiceLetterCode | null>(
    defaults.invoiceLetter,
  );
  const [iibbPerceptionRate, setIibbPerceptionRate] = useState(
    defaults.iibbPerceptionRate?.trim()
      ? defaults.iibbPerceptionRate
      : DEFAULT_IIBB_PERCEPTION_RATE_PCT,
  );
  const isFiscalNote =
    documentKind === "CREDIT_NOTE" || documentKind === "DEBIT_NOTE";
  const isCreditNote = documentKind === "CREDIT_NOTE";
  const [lines, setLines] = useState<SalesNoteLineDraft[]>(
    defaults.lines && defaults.lines.length > 0
      ? defaults.lines
      : [{ description: "", quantity: "1", unitPrice: "", taxRate: "0", discountPct: "0" }],
  );
  const showLetter = requiresArInvoiceLetter(companyCountry, clientCountry);
  const detailHref =
    companyFinanzas || !projectId
      ? `/finanzas/facturas/${invoiceId}`
      : `/proyectos/${projectId}/facturas/${invoiceId}`;

  function updateLine(index: number, patch: Partial<SalesNoteLineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function previewNoteTotal(rateForIibb: string): string {
    let subtotal = "0";
    let taxAmount = "0";
    for (const line of lines) {
      const amounts = calcExclusiveLineAmounts({
        quantity: line.quantity || "0",
        unitPriceNet: line.unitPrice || "0",
        taxRatePercent: invoiceLetter === "C" || invoiceLetter === "E" ? "0" : line.taxRate || "0",
        discountPct: line.discountPct || "0",
      });
      subtotal = roundMoney(addDecimal(subtotal, amounts.lineSubtotal));
      taxAmount = roundMoney(addDecimal(taxAmount, amounts.lineTax));
    }
    return calcDocumentHeaderTaxTotals({
      subtotal,
      taxAmount,
      iibbPerceptionRatePercent: rateForIibb,
    }).totalAmount;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (showLetter && !invoiceLetter) {
      setError("Seleccioná la letra del comprobante (A, B, C o E) antes de guardar");
      return;
    }
    if (isFiscalNote) {
      if (lines.some((l) => !l.description.trim() || !l.unitPrice.trim())) {
        setError("Completá descripción y monto de cada línea");
        return;
      }
    }
    const iibbForSave = isCreditNote ? "0" : iibbPerceptionRate;
    if (isCreditNote && maxCreditAmount) {
      try {
        const total = previewNoteTotal(iibbForSave);
        if (compareDecimal(total, maxCreditAmount) > 0) {
          setError(
            `El total no puede superar el saldo pendiente (${formatMoneyAmount(maxCreditAmount, currency)}).`,
          );
          return;
        }
      } catch {
        setError("Revisá los montos de las líneas");
        return;
      }
    }
    const fd = new FormData(e.currentTarget);
    const payload = {
      issueDate: (fd.get("issueDate") as string) || undefined,
      dueDate: (fd.get("dueDate") as string) || undefined,
      ...(showLetter ? { invoiceLetter } : {}),
      iibbPerceptionRate: iibbForSave,
      notes: (fd.get("notes") as string) || null,
      internalNotes: (fd.get("internalNotes") as string) || null,
      ...(isFiscalNote
        ? {
            lines: lines.map((l, i) => ({
              description: l.description.trim(),
              quantity: l.quantity || "1",
              unitPrice: l.unitPrice,
              taxRate: invoiceLetter === "C" || invoiceLetter === "E" ? "0" : l.taxRate || "0",
              discountPct: l.discountPct || "0",
              sortOrder: i,
            })),
          }
        : {}),
    };
    startTransition(async () => {
      const res =
        companyFinanzas || !projectId
          ? await updateCompanySalesInvoiceAction(invoiceId, payload)
          : await updateSalesInvoiceAction(invoiceId, projectId, payload);
      if ("error" in res) {
        setError(res.error);
      } else {
        router.push(detailHref);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      {isFiscalNote ? (
        <p className="text-sm text-muted-foreground">
          Editá el monto de la {fiscalDocumentKindLabel(documentKind).toLowerCase()} antes de
          emitir.
          {documentKind === "CREDIT_NOTE" && maxCreditAmount
            ? ` Máximo: ${formatMoneyAmount(maxCreditAmount, currency)} (saldo pendiente de la factura de referencia).`
            : documentKind === "CREDIT_NOTE"
              ? " La NC no puede superar el saldo pendiente de la factura de referencia."
              : null}
        </p>
      ) : null}

      {showLetter ? (
        <InvoiceLetterSelect
          id="invoiceLetter"
          value={invoiceLetter}
          required
          onValueChange={(v) => {
            setInvoiceLetter(v);
            if (v === "C" || v === "E") {
              setLines((prev) => prev.map((l) => ({ ...l, taxRate: "0" })));
              setError(null);
            }
          }}
          hint={
            invoiceLetter === "C" || invoiceLetter === "E"
              ? `${invoiceLetterHint(invoiceLetter) ?? ""} Al guardar, las alícuotas de línea pasan a 0%.`.trim()
              : invoiceLetterHint(invoiceLetter)
          }
        />
      ) : null}

        <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="issueDate">Fecha de emisión</Label>
          <Input
            id="issueDate"
            name="issueDate"
            type="date"
            defaultValue={defaults.issueDate}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dueDate">Fecha de vencimiento</Label>
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={defaults.dueDate}
            required
          />
        </div>
        {!isCreditNote ? (
          <IibbPerceptionFields
            id="iibbPerceptionRate"
            rate={iibbPerceptionRate}
            onRateChange={setIibbPerceptionRate}
            subtotal={defaults.subtotal ?? "0"}
            label="Alícuota IIBB (%)"
          />
        ) : null}
      </div>

      {isFiscalNote ? (
        <div className="space-y-3">
          <Label>Líneas</Label>
          {lines.map((line, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-5"
            >
              <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                <Label className="text-xs text-muted-foreground">Descripción</Label>
                <Input
                  value={line.description}
                  onChange={(e) => updateLine(index, { description: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Cant.</Label>
                <Input
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: e.target.value })}
                  inputMode="decimal"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Precio</Label>
                <Input
                  value={line.unitPrice}
                  onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                  inputMode="decimal"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">IVA %</Label>
                <Input
                  value={line.taxRate}
                  onChange={(e) => updateLine(index, { taxRate: e.target.value })}
                  inputMode="decimal"
                  disabled={invoiceLetter === "C" || invoiceLetter === "E"}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <ExpandableNotesField label="Notas" defaultValue={defaults.notes} />

      <ExpandableNotesField
        id="internalNotes"
        name="internalNotes"
        label="Notas internas"
        defaultValue={defaults.internalNotes}
      />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
