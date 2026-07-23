"use client";

import { useState } from "react";
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
  /** When false, hide Desde/Hasta (e.g. materials operativo board uses schedule window, not dates). */
  showDateRange?: boolean;
  showCurrencyView?: boolean;
};

export function ReportDateFilters({
  budgets = [],
  currentBudgetId,
  showBudget = true,
  showDateRange = true,
  showCurrencyView = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [budgetId, setBudgetId] = useState(currentBudgetId ?? "__all__");
  const [currencyView, setCurrencyView] = useState(params.get("currencyView") ?? "ARS");

  /** Preserve page-specific query keys (e.g. materiales window/tab) across filter apply/clear. */
  function preservedParams(): URLSearchParams {
    const sp = new URLSearchParams();
    for (const key of ["window", "tab", "wbsNodeId", "search", "costLayer"] as const) {
      const v = params.get(key);
      if (v) sp.set(key, v);
    }
    return sp;
  }

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sp = preservedParams();
    const bid = (fd.get("budgetId") as string) || budgetId;
    const from = fd.get("dateFrom") as string;
    const to = fd.get("dateTo") as string;
    if (showBudget && bid && bid !== "__all__") sp.set("budgetId", bid);
    if (showDateRange && from) sp.set("dateFrom", from);
    if (showDateRange && to) sp.set("dateTo", to);
    if (showCurrencyView) sp.set("currencyView", currencyView);
    else if (params.get("currencyView")) sp.set("currencyView", params.get("currencyView")!);
    router.push(`${pathname}?${sp.toString()}`);
  }

  function clear() {
    const sp = preservedParams();
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const showBudgetSelect = showBudget && budgets.length > 1;
  if (!showBudgetSelect && !showDateRange && !showCurrencyView) return null;

  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      {showBudgetSelect ? (
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="report-budget-filter">
            Presupuesto
          </Label>
          <input type="hidden" name="budgetId" value={budgetId} />
          <Select value={budgetId} onValueChange={setBudgetId}>
            <SelectTrigger id="report-budget-filter" className="w-52 h-8 text-xs">
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
      ) : null}
      {showDateRange ? (
        <>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="report-date-from">
              Desde
            </Label>
            <Input
              id="report-date-from"
              name="dateFrom"
              type="date"
              className="h-8 text-xs w-36"
              defaultValue={params.get("dateFrom") ?? ""}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="report-date-to">
              Hasta
            </Label>
            <Input
              id="report-date-to"
              name="dateTo"
              type="date"
              className="h-8 text-xs w-36"
              defaultValue={params.get("dateTo") ?? ""}
            />
          </div>
        </>
      ) : null}
      {showCurrencyView ? (
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="report-currency-view">
            Moneda
          </Label>
          <Select value={currencyView} onValueChange={setCurrencyView}>
            <SelectTrigger id="report-currency-view" className="w-36 h-8 text-xs">
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
