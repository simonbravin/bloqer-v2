"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requiresArInvoiceLetter, suggestInvoiceLetter, evaluateInvoiceLetterTaxConsistency, isZeroIvaRate, type InvoiceLetterCode, type IvaConditionCode, invoiceLetterHint, classifySalesInvoice } from "@bloqer/domain";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InvoiceLetterSelect, TaxRateSelect } from "@/features/finance/components/invoice-letter-fields";
import { ExpandableNotesField } from "@/features/finance/components/expandable-notes-field";
import { IibbPerceptionFields } from "@/features/finance/components/iibb-perception-fields";
import { DocumentClassCreateHint } from "@/features/finance/components/document-class-badge";
import { createInvoiceFromCertificationAction } from "@/app/(app)/proyectos/[id]/facturas/actions";
import { formatMoneyAmount } from "@/lib/format-money";

export type CertSummary = {
  id: string;
  code: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: string;
  currency: string;
};

interface Props {
  projectId: string;
  cert: CertSummary;
  companyCountry?: string | null;
  companyIvaCondition?: string | null;
  clientCountry?: string | null;
  clientIvaCondition?: string | null;
}

export function CertificationInvoiceForm({
  projectId,
  cert,
  companyCountry = null,
  companyIvaCondition = null,
  clientCountry = null,
  clientIvaCondition = null,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const showLetter = requiresArInvoiceLetter(companyCountry, clientCountry);
  const suggested = useMemo(
    () =>
      suggestInvoiceLetter({
        issuerIvaCondition: (companyIvaCondition as IvaConditionCode | null) ?? null,
        receiverIvaCondition: (clientIvaCondition as IvaConditionCode | null) ?? null,
        receiverCountry: clientCountry,
      }),
    [companyIvaCondition, clientIvaCondition, clientCountry],
  );
  const [invoiceLetter, setInvoiceLetter] = useState<InvoiceLetterCode | null>(suggested);
  // Certification PU already includes budget taxes — default 0; user may discriminate IVA.
  const [taxRate, setTaxRate] = useState("0");
  const [iibbPerceptionRate, setIibbPerceptionRate] = useState("0");

  const today = toIsoDateInTimeZone();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (showLetter && !invoiceLetter) {
      setError("Seleccioná el tipo de factura (A, B, C o E)");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const forceZeroTax = invoiceLetter === "C" || invoiceLetter === "E";
      const res = await createInvoiceFromCertificationAction(projectId, {
        certificationId: cert.id,
        issueDate: fd.get("issueDate") as string,
        dueDate:   fd.get("dueDate")   as string,
        taxRate: forceZeroTax ? "0" : (taxRate || "0"),
        invoiceLetter: showLetter ? invoiceLetter : null,
        iibbPerceptionRate,
        notes:     (fd.get("notes") as string) || null,
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        router.push(`/proyectos/${projectId}/facturas/${res.id}`);
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="rounded-md bg-muted p-4 text-sm space-y-1">
        <p className="font-medium">Certificación: {cert.code}</p>
        <p className="text-muted-foreground">
          Período: {cert.periodStart} — {cert.periodEnd}
        </p>
        <p className="text-muted-foreground">
          Monto: {formatMoneyAmount(cert.totalAmount, cert.currency)}
        </p>
        <p className="text-xs text-muted-foreground pt-1">
          Se crea un <strong>borrador</strong>. Después tenés que <strong>Emitir</strong> la factura
          para abrir la CxC. La cobranza (con cuenta de tesorería) es lo que acredita caja/banco.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {showLetter ? (
            <div className="sm:col-span-2 flex flex-wrap items-start justify-between gap-3">
              <InvoiceLetterSelect
                id="invoiceLetter"
                className="min-w-[12rem] flex-1"
                value={invoiceLetter}
                required
                onValueChange={(v) => {
                  setInvoiceLetter(v);
                  if (v === "C" || v === "E") setTaxRate("0");
                }}
                hint={invoiceLetterHint(invoiceLetter)}
              />
              <DocumentClassCreateHint
                variant="inline"
                className="pt-7"
                classLabel={
                  classifySalesInvoice({ projectId, certificationId: cert.id }).classLabel
                }
                classFamily={
                  classifySalesInvoice({ projectId, certificationId: cert.id }).family
                }
              />
            </div>
          ) : (
            <div className="sm:col-span-2">
              <DocumentClassCreateHint
                variant="inline"
                classLabel={
                  classifySalesInvoice({ projectId, certificationId: cert.id }).classLabel
                }
                classFamily={
                  classifySalesInvoice({ projectId, certificationId: cert.id }).family
                }
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="issueDate">Fecha de emisión</Label>
            <Input id="issueDate" name="issueDate" type="date" required defaultValue={today} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dueDate">Fecha de vencimiento</Label>
            <Input id="dueDate" name="dueDate" type="date" required defaultValue={today} />
          </div>
          <div className="space-y-1">
            <TaxRateSelect
              id="taxRate"
              value={taxRate}
              onValueChange={setTaxRate}
              showConstructionHint
            />
            <p className="text-[11px] text-muted-foreground">
              El PU de la certificación ya incluye impuestos del presupuesto. Dejá 0% salvo que
              necesites discriminar IVA adicional (p. ej. Factura A al 21% o 10,5%).
            </p>
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
          <IibbPerceptionFields
            id="iibbPerceptionRate"
            rate={iibbPerceptionRate}
            onRateChange={setIibbPerceptionRate}
            subtotal={cert.totalAmount}
            label="Alícuota IIBB (%)"
          />
        </div>

        <ExpandableNotesField label="Notas" />

        <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creando borrador…" : "Crear borrador de factura"}
          </Button>
        </div>
      </form>
    </div>
  );
}
