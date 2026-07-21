"use client";

import { useMemo } from "react";
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
import { formatDecimalAr } from "@/lib/format-money";
import {
  SearchableCombobox,
  SEARCHABLE_NONE,
  productsToSearchableOptions,
  withNoneOption,
  wbsToSearchableOptions,
} from "@/components/ui/searchable-combobox";

export type PurchaseOrderLine = {
  wbsNodeId: string | null;
  productId: string | null;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  varianceJustification?: string | null;
};

export type WbsOption = {
  id: string;
  code: string;
  name: string;
  budgetName: string;
  budgetUnitCost?: string | null;
  budgetUnit?: string | null;
  availableSaldo?: string | null;
  wouldExceedBudget?: boolean;
};
export type ProductOption = { id: string; sku: string; name: string; unit: string };

function safeNum(v: string) {
  const n = parseFloat(v);
  return isNaN(n) || n < 0 ? 0 : n;
}

function linePreview(l: PurchaseOrderLine) {
  const qty = safeNum(l.quantity);
  const price = safeNum(l.unitPrice);
  const rate = safeNum(l.taxRate);
  const subtotal = qty * price;
  const tax = subtotal * (rate / 100);
  return { subtotal, tax, total: subtotal + tax };
}

interface Props {
  lines: PurchaseOrderLine[];
  onChange: (lines: PurchaseOrderLine[]) => void;
  wbsOptions: WbsOption[];
  productOptions?: ProductOption[];
  showVarianceJustification?: boolean;
}

const DEFAULT_LINE: PurchaseOrderLine = {
  wbsNodeId: null,
  productId: null,
  description: "",
  unit: "",
  quantity: "1",
  unitPrice: "",
  taxRate: "21",
};

export function PurchaseOrderLinesEditor({
  lines,
  onChange,
  wbsOptions,
  productOptions = [],
  showVarianceJustification = false,
}: Props) {
  const wbsComboboxOptions = useMemo(
    () => wbsToSearchableOptions(wbsOptions),
    [wbsOptions],
  );
  const productComboboxOptions = useMemo(
    () => withNoneOption(productsToSearchableOptions(productOptions), { label: "Sin producto" }),
    [productOptions],
  );

  function update(i: number, field: keyof PurchaseOrderLine, value: string | null) {
    const next = lines.map((l, idx) => (idx === i ? { ...l, [field]: value } : l));
    onChange(next);
  }

  function addLine() {
    onChange([...lines, { ...DEFAULT_LINE }]);
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
      <p className="text-xs text-muted-foreground">
        Cada línea debe imputar a un ítem WBS. Para gastos generales usá la partida de
        indirectos del presupuesto.
      </p>

      <TableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[18%]">WBS (obligatorio)</TableHead>
              {productOptions.length > 0 && <TableHead className="w-[14%]">Producto</TableHead>}
              <TableHead className="w-[18%]">Descripción</TableHead>
              <TableHead className="w-[6%]">Unidad</TableHead>
              <TableHead className="w-[8%]">Cant.</TableHead>
              <TableHead className="w-[10%]">Precio unit.</TableHead>
              <TableHead className="w-[8%]">Ref. presup.</TableHead>
              <TableHead className="w-[7%]">IVA %</TableHead>
              {showVarianceJustification && (
                <TableHead className="w-[12%]">Justif. desvío</TableHead>
              )}
              <TableHead className="w-[8%] text-right">Total</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, i) => {
              const p = linePreview(line);
              const wbs = wbsOptions.find((w) => w.id === line.wbsNodeId);
              return (
                <TableRow key={i} className="align-top">
                  <TableCell className="py-1.5">
                    <SearchableCombobox
                      popoverWidth="wide"
                      className="h-8 text-xs"
                      options={wbsComboboxOptions}
                      value={line.wbsNodeId ?? ""}
                      onValueChange={(v) => update(i, "wbsNodeId", v || null)}
                      placeholder="Elegir WBS…"
                      searchPlaceholder="Buscar partida…"
                    />
                    {wbs?.availableSaldo != null && (
                      <p
                        className={`mt-1 text-[10px] ${
                          wbs.wouldExceedBudget ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        Saldo part.: {formatDecimalAr(Number(wbs.availableSaldo))}
                        {wbs.wouldExceedBudget ? " (alerta)" : ""}
                      </p>
                    )}
                  </TableCell>
                  {productOptions.length > 0 && (
                    <TableCell className="py-1.5">
                      <SearchableCombobox
                        popoverWidth="wide"
                        className="h-8 text-xs"
                        options={productComboboxOptions}
                        value={line.productId ?? SEARCHABLE_NONE}
                        onValueChange={(v) => {
                          const selected = productOptions.find((pr) => pr.id === v);
                          const next = {
                            ...lines[i],
                            productId: v === SEARCHABLE_NONE ? null : v,
                          };
                          if (selected && !lines[i].unit) next.unit = selected.unit;
                          onChange(lines.map((l, idx) => (idx === i ? next : l)));
                        }}
                        placeholder="Sin producto"
                        searchPlaceholder="Buscar producto…"
                      />
                    </TableCell>
                  )}
                  <TableCell className="py-1.5">
                    <Input
                      required
                      value={line.description}
                      onChange={(e) => update(i, "description", e.target.value)}
                      placeholder="Descripción"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Input
                      value={line.unit}
                      onChange={(e) => update(i, "unit", e.target.value)}
                      placeholder="un"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Input
                      required
                      value={line.quantity}
                      onChange={(e) => update(i, "quantity", e.target.value)}
                      placeholder="1"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Input
                      required
                      value={line.unitPrice}
                      onChange={(e) => update(i, "unitPrice", e.target.value)}
                      placeholder="0.00"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell className="py-1.5 text-xs tabular-nums text-muted-foreground">
                    {wbs?.budgetUnitCost != null
                      ? `${formatDecimalAr(Number(wbs.budgetUnitCost))}${wbs.budgetUnit ? ` / ${wbs.budgetUnit}` : ""}`
                      : "—"}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Input
                      value={line.taxRate}
                      onChange={(e) => update(i, "taxRate", e.target.value)}
                      placeholder="21"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  {showVarianceJustification && (
                    <TableCell className="py-1.5">
                      <Input
                        value={line.varianceJustification ?? ""}
                        onChange={(e) => update(i, "varianceJustification", e.target.value)}
                        placeholder="Si supera presupuesto…"
                        className="h-8 text-sm"
                      />
                    </TableCell>
                  )}
                  <TableCell className="text-right tabular-nums align-top pt-3">
                    {formatDecimalAr(p.total)}
                  </TableCell>
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
          <p className="text-xs text-muted-foreground font-semibold">Total (vista previa)</p>
          <p className="tabular-nums font-semibold">{formatDecimalAr(totals.total)}</p>
        </div>
      </div>
    </div>
  );
}
