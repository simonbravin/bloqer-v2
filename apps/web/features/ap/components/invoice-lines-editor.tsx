"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type InvoiceLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};

function safeNum(v: string) {
  const n = parseFloat(v);
  return isNaN(n) || n < 0 ? 0 : n;
}

function linePreview(l: InvoiceLine) {
  const qty      = safeNum(l.quantity);
  const price    = safeNum(l.unitPrice);
  const rate     = safeNum(l.taxRate);
  const subtotal = qty * price;
  const tax      = subtotal * (rate / 100);
  return { subtotal, tax, total: subtotal + tax };
}

function fmt(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  lines: InvoiceLine[];
  onChange: (lines: InvoiceLine[]) => void;
}

export function InvoiceLinesEditor({ lines, onChange }: Props) {
  function update(i: number, field: keyof InvoiceLine, value: string) {
    const next = lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l);
    onChange(next);
  }

  function addLine() {
    onChange([...lines, { description: "", quantity: "1", unitPrice: "", taxRate: "21" }]);
  }

  function removeLine(i: number) {
    if (lines.length <= 1) return;
    onChange(lines.filter((_, idx) => idx !== i));
  }

  const totals = lines.reduce(
    (acc, l) => {
      const p = linePreview(l);
      return { subtotal: acc.subtotal + p.subtotal, tax: acc.tax + p.tax, total: acc.total + p.total };
    },
    { subtotal: 0, tax: 0, total: 0 },
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Líneas</p>
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          + Agregar línea
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-1 pr-2 font-normal w-[35%]">Descripción</th>
              <th className="pb-1 pr-2 font-normal w-[10%]">Cant.</th>
              <th className="pb-1 pr-2 font-normal w-[15%]">Precio unit.</th>
              <th className="pb-1 pr-2 font-normal w-[10%]">IVA %</th>
              <th className="pb-1 pr-2 font-normal w-[15%] text-right">Subtotal</th>
              <th className="pb-1 pr-2 font-normal w-[10%] text-right">IVA</th>
              <th className="pb-1 font-normal w-[10%] text-right">Total</th>
              <th className="pb-1 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((line, i) => {
              const p = linePreview(line);
              return (
                <tr key={i} className="align-top">
                  <td className="py-1.5 pr-2">
                    <Input
                      required
                      value={line.description}
                      onChange={(e) => update(i, "description", e.target.value)}
                      placeholder="Descripción del ítem"
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      required
                      value={line.quantity}
                      onChange={(e) => update(i, "quantity", e.target.value)}
                      placeholder="1"
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      required
                      value={line.unitPrice}
                      onChange={(e) => update(i, "unitPrice", e.target.value)}
                      placeholder="0.00"
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      value={line.taxRate}
                      onChange={(e) => update(i, "taxRate", e.target.value)}
                      placeholder="21"
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums pt-3">{fmt(p.subtotal)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums pt-3">{fmt(p.tax)}</td>
                  <td className="py-1.5 text-right tabular-nums pt-3">{fmt(p.total)}</td>
                  <td className="py-1.5 pl-2 pt-2">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="text-muted-foreground hover:text-destructive text-xs"
                        aria-label="Eliminar línea"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-8 text-sm border-t pt-3">
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Subtotal</p>
          <p className="tabular-nums font-medium">{fmt(totals.subtotal)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">IVA</p>
          <p className="tabular-nums font-medium">{fmt(totals.tax)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground font-semibold">Total (vista previa)</p>
          <p className="tabular-nums font-semibold">{fmt(totals.total)}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        * Los totales son una vista previa. El servidor recalcula al guardar.
      </p>
    </div>
  );
}
