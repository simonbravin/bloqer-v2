"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SubcontractLineView } from "@bloqer/services";

type Props = {
  subcontractId: string;
  subcontractLines: SubcontractLineView[];
  action: (fd: FormData) => Promise<{ error: string } | { id: string } | { ok: true }>;
  mode?: "create" | "edit";
  initialQuantities?: Record<string, string>;
  defaultDates?: { periodStart?: string; periodEnd?: string; certificationDate?: string };
  defaultNotes?: string;
};

export function SubcontractCertificationForm({
  subcontractId, subcontractLines, action,
  mode = "create", initialQuantities, defaultDates, defaultNotes,
}: Props) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, string>>(initialQuantities ?? {});
  const [error, setPendingError]    = useState<string | null>(null);
  const [pending, setPending]       = useState(false);

  const totalAmount = subcontractLines.reduce((sum, l) => {
    const qty   = parseFloat(quantities[l.id] ?? "0") || 0;
    const price = parseFloat(l.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setPendingError(null);

    const activeLines = subcontractLines
      .filter((l) => parseFloat(quantities[l.id] ?? "0") > 0)
      .map((l) => ({ subcontractLineId: l.id, currentQty: quantities[l.id] ?? "0" }));

    if (activeLines.length === 0) {
      setPendingError("Ingresá al menos una cantidad mayor a cero");
      setPending(false);
      return;
    }

    const fd = new FormData(e.currentTarget);
    fd.set("subcontractId", subcontractId);
    fd.set("lines", JSON.stringify(activeLines));

    const res = await action(fd);
    setPending(false);
    if ("error" in res) { setPendingError(res.error ?? null); return; }
    if (mode === "edit") { router.push(".."); return; }
    if ("id" in res) router.push(`certificaciones/${res.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="periodStart">Período desde *</Label>
          <Input id="periodStart" name="periodStart" type="date" required defaultValue={defaultDates?.periodStart} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="periodEnd">Período hasta *</Label>
          <Input id="periodEnd" name="periodEnd" type="date" required defaultValue={defaultDates?.periodEnd} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="certificationDate">Fecha de certificación *</Label>
          <Input id="certificationDate" name="certificationDate" type="date" required defaultValue={defaultDates?.certificationDate} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" name="notes" rows={2} defaultValue={defaultNotes} />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">Cantidades a certificar</h3>
        <p className="text-sm text-muted-foreground">Ingresá la cantidad a certificar en este período por línea. Dejá en cero las que no se certifican.</p>
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Descripción</th>
                <th className="px-3 py-2 text-right">Unidad</th>
                <th className="px-3 py-2 text-right">Contratado</th>
                <th className="px-3 py-2 text-right">Prev. certif.</th>
                <th className="px-3 py-2 text-right">Saldo pend.</th>
                <th className="px-3 py-2 text-right">Precio unit.</th>
                <th className="px-3 py-2 text-right w-32">Certif. actual</th>
                <th className="px-3 py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {subcontractLines.map((l) => {
                const qty       = parseFloat(quantities[l.id] ?? "0") || 0;
                const importe   = qty * parseFloat(l.unitPrice);
                const remaining = parseFloat(l.remainingQty);
                return (
                  <tr key={l.id} className="border-t">
                    <td className="px-3 py-2">{l.description}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{l.unit}</td>
                    <td className="px-3 py-2 text-right">{parseFloat(l.quantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right">{parseFloat(l.certifiedQuantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                    <td className={`px-3 py-2 text-right ${remaining <= 0 ? "text-muted-foreground line-through" : ""}`}>
                      {remaining.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right">{parseFloat(l.unitPrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2">
                      <Input
                        className="h-8 text-xs text-right"
                        type="number"
                        step="any"
                        min="0"
                        max={l.remainingQty}
                        value={quantities[l.id] ?? ""}
                        onChange={(e) => setQuantities((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        disabled={remaining <= 0}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {importe > 0 ? importe.toLocaleString("es-AR", { minimumFractionDigits: 2 }) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t bg-muted/30">
              <tr>
                <td colSpan={7} className="px-3 py-2 text-right font-medium text-sm">Total certificado:</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {totalAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={pending}>{pending ? "Guardando..." : mode === "edit" ? "Guardar cambios" : "Crear certificación"}</Button>
      </div>
    </form>
  );
}
