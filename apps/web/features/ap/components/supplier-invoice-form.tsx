"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableCombobox, SEARCHABLE_NONE, toSearchableOptions, withNoneOption } from "@/components/ui/searchable-combobox";
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
  variant?: "card" | "plain";
  onCancel?: () => void;
  onSuccess?: () => void;
}

const DEFAULT_LINE: InvoiceLine = { description: "", quantity: "1", unitPrice: "", taxRate: "21" };

export function SupplierInvoiceForm({
  projectId,
  companyFinanzas = false,
  suppliers,
  poOptions = [],
  variant = "card",
  onCancel,
  onSuccess,
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
  const poComboboxOptions = useMemo(
    () =>
      withNoneOption(
        toSearchableOptions(filteredPOs.map((po) => ({ id: po.id, label: po.code }))),
        { label: "Sin OC vinculada" },
      ),
    [filteredPOs],
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
          onSuccess?.();
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
        onSuccess?.();
        router.push(`/proyectos/${projectId}/facturas-proveedor/${res.id}`);
      }
    });
  }

  return (
    <div className={variant === "card" ? "rounded-lg border bg-card p-6" : undefined}>
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
              <SearchableCombobox
                options={toSearchableOptions(suppliers)}
                value={supplierContactId}
                onValueChange={setSupplierContactId}
                placeholder="Seleccionar proveedor…"
                searchPlaceholder="Buscar proveedor…"
                emptyText="Ningún proveedor coincide."
              />
            )}
          </div>

          {filteredPOs.length > 0 && !companyFinanzas && (
            <div className="col-span-2 space-y-1">
              <Label>Orden de compra (opcional)</Label>
              <SearchableCombobox
                options={poComboboxOptions}
                value={purchaseOrderId ?? SEARCHABLE_NONE}
                onValueChange={(v) =>
                  setPurchaseOrderId(v === SEARCHABLE_NONE ? null : v)
                }
                placeholder="Sin OC vinculada"
                searchPlaceholder="Buscar OC…"
              />
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
          <Button type="button" variant="outline" onClick={onCancel ?? (() => router.back())}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending || suppliers.length === 0}>
            {isPending ? "Guardando…" : "Crear factura"}
          </Button>
        </div>
      </form>
    </div>
  );
}
