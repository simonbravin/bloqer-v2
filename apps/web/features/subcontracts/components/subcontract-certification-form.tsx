"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOperationalAction } from "@/hooks/use-operational-action";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { addDecimal, multiplyDecimal, serializeMoney } from "@bloqer/utils";
import type { SubcontractLineView } from "@bloqer/services";
import {
  formatMoneyAmount,
  formatQtyFromString,
  formatUnitPriceFromString,
  isPositiveQty,
} from "@/lib/format-money";

type Props = {
  projectId: string;
  subcontractId: string;
  certificationId?: string;
  currency: string;
  subcontractLines: SubcontractLineView[];
  action: (fd: FormData) => Promise<{ error: string } | { id: string } | { ok: true }>;
  mode?: "create" | "edit";
  initialQuantities?: Record<string, string>;
  defaultDates?: { periodStart?: string; periodEnd?: string; certificationDate?: string };
  defaultNotes?: string;
  /** BR-SUB-005: rejected predecessor id when creating a corrected version. */
  replacesCertificationId?: string | null;
  replacesCertificationCode?: string | null;
};

export function SubcontractCertificationForm({
  projectId,
  subcontractId,
  certificationId,
  currency,
  subcontractLines,
  action,
  mode = "create",
  initialQuantities,
  defaultDates,
  defaultNotes,
  replacesCertificationId,
  replacesCertificationCode,
}: Props) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, string>>(initialQuantities ?? {});
  const [error, setPendingError] = useState<string | null>(null);
  const { pending, run } = useOperationalAction({ onError: setPendingError });

  function previewLineMoney(qty: string, price: string): string {
    try {
      return serializeMoney(multiplyDecimal(qty.trim() || "0", price.trim() || "0"));
    } catch {
      return "0.00";
    }
  }

  const totalAmount = subcontractLines.reduce(
    (sum, l) => addDecimal(sum, previewLineMoney(quantities[l.id] ?? "0", l.unitPrice)),
    "0",
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(async () => {
      setPendingError(null);

      const activeLines = subcontractLines
        .filter((l) => isPositiveQty(quantities[l.id] ?? "0"))
        .map((l) => ({ subcontractLineId: l.id, currentQty: quantities[l.id] ?? "0" }));

      if (activeLines.length === 0) {
        setPendingError("Ingresá al menos una cantidad mayor a cero");
        return;
      }

      fd.set("subcontractId", subcontractId);
      fd.set("lines", JSON.stringify(activeLines));
      if (replacesCertificationId) {
        fd.set("replacesCertificationId", replacesCertificationId);
      }

      const res = await action(fd);
      if ("error" in res) {
        setPendingError(res.error ?? null);
        return;
      }
      toast.success(mode === "edit" ? "Certificación actualizada." : "Certificación guardada.");
      const id = "id" in res ? res.id : certificationId;
      if (id)
        router.push(`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset disabled={pending} className="min-w-0 space-y-6">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {replacesCertificationId && (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Nueva versión que reemplaza{" "}
            <span className="font-medium text-foreground">
              {replacesCertificationCode ?? "la certificación rechazada"}
            </span>
            .
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="periodStart">Período desde *</Label>
            <Input
              id="periodStart"
              name="periodStart"
              type="date"
              required
              defaultValue={defaultDates?.periodStart}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="periodEnd">Período hasta *</Label>
            <Input
              id="periodEnd"
              name="periodEnd"
              type="date"
              required
              defaultValue={defaultDates?.periodEnd}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="certificationDate">Fecha de certificación *</Label>
            <Input
              id="certificationDate"
              name="certificationDate"
              type="date"
              required
              defaultValue={defaultDates?.certificationDate}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={defaultNotes} />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium">Cantidades a certificar</h3>
          <p className="text-sm text-muted-foreground">
            Ingresá la cantidad a certificar en este período por línea. Dejá en cero las que no se
            certifican.
          </p>
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Unidad</TableHead>
                  <TableHead className="text-right">Contratado</TableHead>
                  <TableHead className="text-right">Prev. certif.</TableHead>
                  <TableHead className="text-right">Saldo pend.</TableHead>
                  <TableHead className="text-right">Precio unit.</TableHead>
                  <TableHead className="text-right w-32">Certif. actual</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subcontractLines.map((l) => {
                  const importe = previewLineMoney(quantities[l.id] ?? "0", l.unitPrice);
                  const remainingOpen = isPositiveQty(l.remainingQty);
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{l.description}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{l.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQtyFromString(l.quantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQtyFromString(l.certifiedQuantity)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${remainingOpen ? "" : "text-muted-foreground line-through"}`}
                      >
                        {formatQtyFromString(l.remainingQty)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatUnitPriceFromString(l.unitPrice)}
                      </TableCell>
                      <TableCell>
                        <DecimalInput
                          precision={4}
                          aria-label={`Cantidad a certificar: ${l.description}`}
                          className="h-8 text-xs text-right"
                          value={quantities[l.id] ?? ""}
                          onValueChange={(v) => setQuantities((prev) => ({ ...prev, [l.id]: v }))}
                          disabled={pending || !remainingOpen}
                          placeholder="0,00"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {isPositiveQty(quantities[l.id] ?? "0")
                          ? formatMoneyAmount(importe, currency)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter className="bg-muted/30">
                <TableRow>
                  <TableCell colSpan={7} className="text-right font-medium">
                    Total certificado:
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMoneyAmount(totalAmount, currency)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </TableScroll>
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando..." : mode === "edit" ? "Guardar cambios" : "Crear certificación"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
