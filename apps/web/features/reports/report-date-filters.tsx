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
import type { AvailableBudget } from "@bloqer/services";

type Props = {
  budgets?: AvailableBudget[];
  currentBudgetId?: string;
  showBudget?: boolean;
  showCurrencyView?: boolean;
};

export function ReportDateFilters({
  budgets = [],
  currentBudgetId,
  showBudget = true,
  showCurrencyView = false,
}: Props) {
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
    if (showBudget && bid && bid !== "__all__") sp.set("budgetId", bid);
    if (from) sp.set("dateFrom", from);
    if (to) sp.set("dateTo", to);
    const layer = params.get("costLayer");
    if (layer) sp.set("costLayer", layer);
    const cv = fd.get("currencyView") as string;
    if (showCurrencyView && cv) sp.set("currencyView", cv);
    else if (params.get("currencyView")) sp.set("currencyView", params.get("currencyView")!);
    router.push(`${pathname}?${sp.toString()}`);
  }

  function clear() {
    router.push(pathname);
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      {showBudget && budgets.length > 1 && (
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
      {showCurrencyView ? (
        <div className="space-y-1">
          <Label className="text-xs">Moneda</Label>
          <Select name="currencyView" defaultValue={params.get("currencyView") ?? "ARS"}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ARS">Consolidado ARS</SelectItem>
              <SelectItem value="original">Por moneda</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <Button type="submit" size="sm" className="h-8">
        Aplicar
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={clear}>
        Limpiar
      </Button>
    </form>
  );
}
