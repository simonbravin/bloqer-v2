"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
}

export function CertificationInvoiceForm({ projectId, cert }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createInvoiceFromCertificationAction(projectId, {
        certificationId: cert.id,
        issueDate: fd.get("issueDate") as string,
        dueDate:   fd.get("dueDate")   as string,
        taxRate:   (fd.get("taxRate") as string) || "21",
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
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="issueDate">Fecha de emisión</Label>
            <Input id="issueDate" name="issueDate" type="date" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dueDate">Fecha de vencimiento</Label>
            <Input id="dueDate" name="dueDate" type="date" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="taxRate">Alícuota IVA (%)</Label>
            <Input id="taxRate" name="taxRate" defaultValue="21" />
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
            {isPending ? "Generando…" : "Generar factura"}
          </Button>
        </div>
      </form>
    </div>
  );
}
