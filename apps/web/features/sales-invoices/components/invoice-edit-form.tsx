"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requiresArInvoiceLetter, type InvoiceLetterCode, invoiceLetterHint } from "@bloqer/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceLetterSelect } from "@/features/finance/components/invoice-letter-fields";
import { updateSalesInvoiceAction } from "@/app/(app)/proyectos/[id]/facturas/actions";

interface Props {
  projectId: string;
  invoiceId: string;
  companyCountry?: string | null;
  clientCountry?: string | null;
  defaults: {
    issueDate: string;
    dueDate: string;
    notes: string;
    internalNotes: string;
    invoiceLetter: InvoiceLetterCode | null;
  };
}

export function InvoiceEditForm({
  projectId,
  invoiceId,
  companyCountry,
  clientCountry,
  defaults,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [invoiceLetter, setInvoiceLetter] = useState<InvoiceLetterCode | null>(
    defaults.invoiceLetter,
  );
  const showLetter = requiresArInvoiceLetter(companyCountry, clientCountry);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (showLetter && !invoiceLetter) {
      setError("Seleccioná el tipo de factura (A, B, C o E) antes de guardar");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateSalesInvoiceAction(invoiceId, projectId, {
        issueDate:     (fd.get("issueDate")     as string) || undefined,
        dueDate:       (fd.get("dueDate")       as string) || undefined,
        // Only patch letter when AR gating is known; avoid wiping on failed country load.
        ...(showLetter ? { invoiceLetter } : {}),
        notes:         (fd.get("notes")         as string) || null,
        internalNotes: (fd.get("internalNotes") as string) || null,
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        router.push(`/proyectos/${projectId}/facturas/${invoiceId}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      {showLetter ? (
        <InvoiceLetterSelect
          id="invoiceLetter"
          value={invoiceLetter}
          required
          onValueChange={setInvoiceLetter}
          hint={invoiceLetterHint(invoiceLetter)}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="issueDate">Fecha de emisión</Label>
          <Input id="issueDate" name="issueDate" type="date" defaultValue={defaults.issueDate} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dueDate">Fecha de vencimiento</Label>
          <Input id="dueDate" name="dueDate" type="date" defaultValue={defaults.dueDate} required />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={defaults.notes} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="internalNotes">Notas internas</Label>
        <Textarea id="internalNotes" name="internalNotes" rows={2} defaultValue={defaults.internalNotes} />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
