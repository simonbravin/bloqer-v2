"use client";

import {
  addDecimal,
  divideDecimal,
  multiplyDecimal,
  roundMoney,
} from "@bloqer/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatDecimalArFromString } from "@/lib/format-money";

export type InvoiceLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};

function safeDecimal(v: string): string {
  const t = v.trim();
  if (!t || !/^-?\d+(\.\d+)?$/.test(t) || t.startsWith("-")) return "0";
  return t;
}

/** Client preview aligned with server calcLine [D-053] (round each money component). */
function linePreview(l: InvoiceLine) {
  const qty = safeDecimal(l.quantity);
  const price = safeDecimal(l.unitPrice);
  const rate = safeDecimal(l.taxRate);
  const subtotal = roundMoney(multiplyDecimal(qty, price));
  const tax = roundMoney(divideDecimal(multiplyDecimal(subtotal, rate), "100"));
  const total = roundMoney(addDecimal(subtotal, tax));
  return { subtotal, tax, total };
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
      return {
        subtotal: roundMoney(addDecimal(acc.subtotal, p.subtotal)),
        tax: roundMoney(addDecimal(acc.tax, p.tax)),
        total: roundMoney(addDecimal(acc.total, p.total)),
      };
    },
    { subtotal: "0.00", tax: "0.00", total: "0.00" },
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Líneas</p>
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          + Agregar línea
        </Button>
      </div>

      <TableScroll>
        <Table className="min-w-[44rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[14rem]">Descripción</TableHead>
              <TableHead className="min-w-[5rem] w-[5.5rem]">Cant.</TableHead>
              <TableHead className="min-w-[7rem] w-[7.5rem]">Precio unit.</TableHead>
              <TableHead className="min-w-[4.5rem] w-[5rem]">IVA %</TableHead>
              <TableHead className="min-w-[6rem] text-right">Subtotal</TableHead>
              <TableHead className="min-w-[5rem] text-right">IVA</TableHead>
              <TableHead className="min-w-[5.5rem] text-right">Total</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, i) => {
              const p = linePreview(line);
              return (
                <TableRow key={i} className="align-top">
                  <TableCell className="min-w-[14rem] py-2">
                    <Input
                      required
                      value={line.description}
                      onChange={(e) => update(i, "description", e.target.value)}
                      placeholder="Descripción del ítem"
                      className="h-9 w-full min-w-[12rem] text-sm"
                    />
                  </TableCell>
                  <TableCell className="py-2">
                    <Input
                      required
                      value={line.quantity}
                      onChange={(e) => update(i, "quantity", e.target.value)}
                      placeholder="1"
                      className="h-9 w-full min-w-[4rem] text-sm tabular-nums"
                    />
                  </TableCell>
                  <TableCell className="py-2">
                    <Input
                      required
                      value={line.unitPrice}
                      onChange={(e) => update(i, "unitPrice", e.target.value)}
                      placeholder="0.00"
                      className="h-9 w-full min-w-[5.5rem] text-sm tabular-nums"
                    />
                  </TableCell>
                  <TableCell className="py-2">
                    <Input
                      value={line.taxRate}
                      onChange={(e) => update(i, "taxRate", e.target.value)}
                      placeholder="21"
                      className="h-9 w-full min-w-[3.5rem] text-sm tabular-nums"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums align-top pt-3">{formatDecimalArFromString(p.subtotal)}</TableCell>
                  <TableCell className="text-right tabular-nums align-top pt-3">{formatDecimalArFromString(p.tax)}</TableCell>
                  <TableCell className="text-right tabular-nums align-top pt-3">{formatDecimalArFromString(p.total)}</TableCell>
                  <TableCell className="align-top pt-2">
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableScroll>

      <div className="flex justify-end gap-8 text-sm border-t pt-3">
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Subtotal</p>
          <p className="tabular-nums font-medium">{formatDecimalArFromString(totals.subtotal)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">IVA</p>
          <p className="tabular-nums font-medium">{formatDecimalArFromString(totals.tax)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground font-semibold">Total (vista previa)</p>
          <p className="tabular-nums font-semibold">{formatDecimalArFromString(totals.total)}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        * Los totales son una vista previa. El servidor recalcula al guardar.
      </p>
    </div>
  );
}
