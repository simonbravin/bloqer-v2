"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { InvoiceLinesEditor } from "./invoice-lines-editor";
import type { InvoiceLine } from "./invoice-lines-editor";
import { createSupplierInvoiceAction } from "@/app/(app)/proyectos/[id]/facturas-proveedor/actions";
import { createCompanySupplierInvoiceAction } from "@/app/(app)/finanzas/facturas-proveedor/actions";

export type SupplierOption = { id: string; label: string };
export type POOption = { id: string; code: string; supplierContactId: string; currency: string };

interface Props {
  /** Required when `companyFinanzas` is false */
  projectId?: string;
  companyFinanzas?: boolean;
  suppliers: SupplierOption[];
  poOptions?: POOption[];
}

const DEFAULT_LINE: InvoiceLine = { description: "", quantity: "1", unitPrice: "", taxRate: "21" };

export function SupplierInvoiceForm({
  projectId,
  companyFinanzas = false,
  suppliers,
  poOptions = [],
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [supplierContactId, setSupplierContactId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([{ ...DEFAULT_LINE }]);

  const filteredPOs = poOptions.filter(
    (po) => !supplierContactId || po.supplierContactId === supplierContactId,
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supplierContactId) { setError("Debe seleccionar un proveedor"); return; }
    if (lines.some((l) => !l.description.trim() || !l.quantity || !l.unitPrice)) {
      setError("Completar descripción, cantidad y precio en todas las líneas");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      if (companyFinanzas) {
        const res = await createCompanySupplierInvoiceAction({
          supplierContactId,
          issueDate:     fd.get("issueDate") as string,
          dueDate:       fd.get("dueDate") as string,
          currency:      "ARS",
          notes:         (fd.get("notes") as string) || null,
          internalNotes: null,
          lines:         lines.map((l, i) => ({ ...l, sortOrder: i })),
        });
        if ("error" in res) {
          setError(res.error);
        } else {
          router.push(`/finanzas/facturas-proveedor/${res.id}`);
        }
        return;
      }
      if (!projectId) {
        setError("Configuración inválida del formulario");
        return;
      }
      const res = await createSupplierInvoiceAction(projectId, {
        projectId,
        supplierContactId,
        issueDate:       fd.get("issueDate")  as string,
        dueDate:         fd.get("dueDate")    as string,
        currency:        "ARS",
        notes:           (fd.get("notes") as string) || null,
        internalNotes:   null,
        purchaseOrderId: purchaseOrderId ?? null,
        lines:           lines.map((l, i) => ({ ...l, sortOrder: i })),
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        router.push(`/proyectos/${projectId}/facturas-proveedor/${res.id}`);
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
            {suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay proveedores activos. Cree un contacto con rol Proveedor primero.
              </p>
            ) : (
              <Select
                onValueChange={setSupplierContactId}
                value={supplierContactId || undefined}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar proveedor…" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {filteredPOs.length > 0 && !companyFinanzas && (
            <div className="col-span-2 space-y-1">
              <Label>Orden de compra (opcional)</Label>
              <Select
                onValueChange={(v) => setPurchaseOrderId(v === "__none__" ? null : v)}
                value={purchaseOrderId ?? "__none__"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin OC vinculada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin OC vinculada</SelectItem>
                  {filteredPOs.map((po) => (
                    <SelectItem key={po.id} value={po.id}>{po.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="issueDate">Fecha de emisión</Label>
            <Input id="issueDate" name="issueDate" type="date" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dueDate">Fecha de vencimiento</Label>
            <Input id="dueDate" name="dueDate" type="date" required />
          </div>
        </div>

        <hr />

        <InvoiceLinesEditor lines={lines} onChange={setLines} />

        <hr />

        <div className="space-y-1">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={isPending || suppliers.length === 0}>
            {isPending ? "Guardando…" : "Crear factura"}
          </Button>
        </div>
      </form>
    </div>
  );
}
