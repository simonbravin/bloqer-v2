"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AvailableBudget, CostVarianceLayer } from "@bloqer/services";

const LAYER_OPTIONS: { value: CostVarianceLayer; label: string }[] = [
  { value: "exposure", label: "Exposición esperada" },
  { value: "committed", label: "Comprometido" },
  { value: "accrued", label: "Devengado" },
  { value: "paid", label: "Pagado" },
];

type Props = {
  budgets: AvailableBudget[];
  currentBudgetId?: string;
  currentLayer?: CostVarianceLayer;
};

export function BudgetVarianceFilters({ budgets, currentBudgetId, currentLayer = "exposure" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sp = new URLSearchParams();
    const bid = fd.get("budgetId") as string;
    const from = fd.get("dateFrom") as string;
    const to = fd.get("dateTo") as string;
    const q = fd.get("wbsSearch") as string;
    const layer = fd.get("costLayer") as string;
    if (bid && bid !== "__all__") sp.set("budgetId", bid);
    if (from) sp.set("dateFrom", from);
    if (to) sp.set("dateTo", to);
    if (q) sp.set("wbsSearch", q);
    if (layer) sp.set("costLayer", layer);
    router.push(`${pathname}?${sp.toString()}`);
  }

  function clear() {
    router.push(pathname);
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      {budgets.length > 1 && (
        <div className="space-y-1">
          <Label className="text-xs">Presupuesto</Label>
          <Select name="budgetId" defaultValue={currentBudgetId ?? "__all__"}>
            <SelectTrigger className="w-52 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">— todos —</SelectItem>
              {budgets.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} ({b.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs">Capa de costo</Label>
        <Select name="costLayer" defaultValue={currentLayer}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LAYER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Desde</Label>
        <Input
          name="dateFrom"
          type="date"
          className="h-8 text-xs w-36"
          defaultValue={params.get("dateFrom") ?? ""}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Hasta</Label>
        <Input
          name="dateTo"
          type="date"
          className="h-8 text-xs w-36"
          defaultValue={params.get("dateTo") ?? ""}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Buscar partida</Label>
        <Input
          name="wbsSearch"
          className="h-8 text-xs w-40"
          placeholder="Código o nombre…"
          defaultValue={params.get("wbsSearch") ?? ""}
        />
      </div>
      <Button type="submit" size="sm" className="h-8">
        Aplicar
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={clear}>
        Limpiar
      </Button>
    </form>
  );
}
