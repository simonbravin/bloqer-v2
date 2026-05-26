"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencySelect } from "@/components/ui/currency-select";

export type SubcontractorOption = { id: string; legalName: string; fantasyName: string | null };
export type WbsOption           = { id: string; code: string; name: string; unit: string };

type LineState = {
  wbsNodeId:   string;
  description: string;
  unit:        string;
  quantity:    string;
  unitPrice:   string;
  notes:       string;
};

const DEFAULT_LINE: LineState = { wbsNodeId: "__none__", description: "", unit: "", quantity: "", unitPrice: "", notes: "" };

type Props = {
  projectId:             string;
  companyId:             string;
  subcontractorOptions:  SubcontractorOption[];
  wbsOptions:            WbsOption[];
  action: (fd: FormData) => Promise<{ error: string } | { id: string }>;
  defaultValues?: {
    subcontractorContactId: string;
    title:       string;
    description: string;
    contractDate: string;
    startDate:   string;
    expectedEndDate: string;
    currency:    string;
    notes:       string;
    internalNotes: string;
    lines: LineState[];
  };
  submitLabel?: string;
};

export function SubcontractForm({
  projectId, companyId, subcontractorOptions, wbsOptions, action,
  defaultValues, submitLabel = "Crear subcontrato",
}: Props) {
  const router = useRouter();
  const [lines, setLines]                 = useState<LineState[]>(defaultValues?.lines ?? [{ ...DEFAULT_LINE }]);
  const [subcontractorId, setSubcontractorId] = useState(defaultValues?.subcontractorContactId ?? "__none__");
  const [currency, setCurrency] = useState(defaultValues?.currency ?? "ARS");
  const [error, setError]                 = useState<string | null>(null);
  const [pending, setPending]             = useState(false);

  function addLine() { setLines((prev) => [...prev, { ...DEFAULT_LINE }]); }
  function removeLine(i: number) { setLines((prev) => prev.filter((_, idx) => idx !== i)); }
  function updateLine(i: number, field: keyof LineState, value: string) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }
  function handleWbsChange(i: number, wbsId: string) {
    const wbs = wbsOptions.find((w) => w.id === wbsId);
    setLines((prev) => prev.map((l, idx) =>
      idx === i ? { ...l, wbsNodeId: wbsId, unit: wbs?.unit ?? l.unit } : l,
    ));
  }

  const totalValue = lines.reduce((sum, l) => {
    const qty = parseFloat(l.quantity) || 0;
    const price = parseFloat(l.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("projectId",  projectId);
    fd.set("companyId",  companyId);
    fd.set("subcontractorContactId", subcontractorId === "__none__" ? "" : subcontractorId);
    fd.set("currency", currency);
    fd.set("lines", JSON.stringify(lines.map((l) => ({
      wbsNodeId:   l.wbsNodeId === "__none__" ? null : l.wbsNodeId || null,
      description: l.description,
      unit:        l.unit,
      quantity:    l.quantity,
      unitPrice:   l.unitPrice,
      notes:       l.notes || null,
    }))));
    const res = await action(fd);
    setPending(false);
    if ("error" in res) { setError(res.error ?? null); return; }
    toast.success("Subcontrato guardado.");
    router.push(`subcontratos/${res.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1">
          <Label htmlFor="title">Título *</Label>
          <Input id="title" name="title" required defaultValue={defaultValues?.title} />
        </div>

        <div className="space-y-1">
          <Label>Subcontratista *</Label>
          <Select value={subcontractorId} onValueChange={setSubcontractorId} required>
            <SelectTrigger><SelectValue placeholder="Seleccionar subcontratista" /></SelectTrigger>
            <SelectContent>
              {subcontractorOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.fantasyName ?? c.legalName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="currency">Moneda</Label>
          <CurrencySelect id="currency" value={currency} onValueChange={setCurrency} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="contractDate">Fecha de contrato *</Label>
          <Input id="contractDate" name="contractDate" type="date" required defaultValue={defaultValues?.contractDate} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="startDate">Fecha de inicio</Label>
          <Input id="startDate" name="startDate" type="date" defaultValue={defaultValues?.startDate} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="expectedEndDate">Fecha estimada de fin</Label>
          <Input id="expectedEndDate" name="expectedEndDate" type="date" defaultValue={defaultValues?.expectedEndDate} />
        </div>

        <div className="col-span-2 space-y-1">
          <Label htmlFor="description">Descripción</Label>
          <Textarea id="description" name="description" rows={2} defaultValue={defaultValues?.description} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" name="notes" rows={2} defaultValue={defaultValues?.notes} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="internalNotes">Notas internas</Label>
          <Textarea id="internalNotes" name="internalNotes" rows={2} defaultValue={defaultValues?.internalNotes} />
        </div>
      </div>

      {/* Lines */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Líneas del subcontrato</h3>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>+ Agregar línea</Button>
        </div>
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">WBS (ITEM)</th>
                <th className="px-3 py-2 text-left">Descripción *</th>
                <th className="px-3 py-2 text-left">Unidad</th>
                <th className="px-3 py-2 text-right">Cantidad *</th>
                <th className="px-3 py-2 text-right">Precio unit. *</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const sub = (parseFloat(line.quantity) || 0) * (parseFloat(line.unitPrice) || 0);
                return (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 min-w-[160px]">
                      <Select value={line.wbsNodeId} onValueChange={(v) => handleWbsChange(i, v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sin WBS" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sin WBS</SelectItem>
                          {wbsOptions.map((w) => (
                            <SelectItem key={w.id} value={w.id}>[{w.code}] {w.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 min-w-[200px]">
                      <Input className="h-8 text-xs" value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} required />
                    </td>
                    <td className="px-3 py-2 min-w-[80px]">
                      <Input className="h-8 text-xs" value={line.unit} onChange={(e) => updateLine(i, "unit", e.target.value)} />
                    </td>
                    <td className="px-3 py-2 min-w-[100px]">
                      <Input className="h-8 text-xs text-right" type="number" step="any" min="0.0001" value={line.quantity} onChange={(e) => updateLine(i, "quantity", e.target.value)} required />
                    </td>
                    <td className="px-3 py-2 min-w-[120px]">
                      <Input className="h-8 text-xs text-right" type="number" step="any" min="0.0001" value={line.unitPrice} onChange={(e) => updateLine(i, "unitPrice", e.target.value)} required />
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {sub.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2">
                      {lines.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(i)} className="h-6 w-6 p-0 text-destructive">×</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t bg-muted/30">
              <tr>
                <td colSpan={5} className="px-3 py-2 text-right font-medium text-sm">Total del contrato:</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {totalValue.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={pending}>{pending ? "Guardando..." : submitLabel}</Button>
      </div>
    </form>
  );
}
