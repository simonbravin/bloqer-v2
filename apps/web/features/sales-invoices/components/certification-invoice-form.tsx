"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requiresArInvoiceLetter, suggestInvoiceLetter, evaluateInvoiceLetterTaxConsistency, type InvoiceLetterCode, type IvaConditionCode, invoiceLetterHint } from "@bloqer/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceLetterSelect, TaxRateSelect } from "@/features/finance/components/invoice-letter-fields";
import { createInvoiceFromCertificationAction } from "@/app/(app)/proyectos/[id]/facturas/actions";

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

  const today = new Date().toISOString().slice(0, 10);

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
          Monto: {new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2 }).format(parseFloat(cert.totalAmount))} {cert.currency}
        </p>
        <p className="text-xs text-muted-foreground pt-1">
          Se crea un <strong>borrador</strong>. Después tenés que <strong>Emitir</strong> la factura
          para abrir la CxC. La cobranza (con cuenta de tesorería) es lo que acredita caja/banco.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          {showLetter ? (
            <div className="col-span-2">
              <InvoiceLetterSelect
                id="invoiceLetter"
                value={invoiceLetter}
                required
                onValueChange={(v) => {
                  setInvoiceLetter(v);
                  if (v === "C" || v === "E") setTaxRate("0");
                }}
                hint={invoiceLetterHint(invoiceLetter)}
              />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="issueDate">Fecha de emisión</Label>
            <Input id="issueDate" name="issueDate" type="date" required defaultValue={today} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dueDate">Fecha de vencimiento</Label>
            <Input id="dueDate" name="dueDate" type="date" required defaultValue={today} />
          </div>
          <div className="space-y-1 col-span-2">
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
              taxAmount: taxRate === "0" ? "0" : "1",
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

        <div className="flex justify-end gap-2">
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
