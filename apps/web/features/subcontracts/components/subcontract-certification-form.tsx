"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
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
    toast.success(mode === "edit" ? "Certificación actualizada." : "Certificación guardada.");
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
                const qty       = parseFloat(quantities[l.id] ?? "0") || 0;
                const importe   = qty * parseFloat(l.unitPrice);
                const remaining = parseFloat(l.remainingQty);
                return (
                  <TableRow key={l.id}>
                    <TableCell>{l.description}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{l.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {parseFloat(l.quantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {parseFloat(l.certifiedQuantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${remaining <= 0 ? "text-muted-foreground line-through" : ""}`}>
                      {remaining.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {parseFloat(l.unitPrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {importe > 0 ? importe.toLocaleString("es-AR", { minimumFractionDigits: 2 }) : "—"}
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
                  {totalAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TableScroll>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={pending}>{pending ? "Guardando..." : mode === "edit" ? "Guardar cambios" : "Crear certificación"}</Button>
      </div>
    </form>
  );
}
