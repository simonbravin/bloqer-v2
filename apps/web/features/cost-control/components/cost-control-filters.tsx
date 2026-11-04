"use client";

import { useEffect, useRef } from "react";
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
import { useDebouncedSearchParam } from "@/hooks/use-debounced-search-param";
import type { AvailableBudget } from "@bloqer/services";
import {
  budgetFilterOptionLabel,
  defaultContractualBudgetId,
} from "@/features/budgets/components/budget-status-badge";

type Props = {
  budgets: AvailableBudget[];
  currentBudgetId?: string;
};

export function CostControlFilters({ budgets, currentBudgetId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { defaultValue: wbsSearchDefault, setDebounced: setWbsSearchDebounced, cancelPending } =
    useDebouncedSearchParam("wbsSearch");
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const syncHistory = () => {
      cancelPending();
      if (searchInput.current) searchInput.current.value = new URLSearchParams(window.location.search).get("wbsSearch") ?? "";
    };
    window.addEventListener("popstate", syncHistory);
    return () => window.removeEventListener("popstate", syncHistory);
  }, [cancelPending]);

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    cancelPending();
    const fd = new FormData(e.currentTarget);
    const sp = new URLSearchParams(params.toString());
    const bid = fd.get("budgetId") as string;
    const from = fd.get("dateFrom") as string;
    const to = fd.get("dateTo") as string;
    const wbsSearch = (fd.get("wbsSearch") as string)?.trim() ?? "";

    sp.delete("budgetId");
    sp.delete("dateFrom");
    sp.delete("dateTo");
    sp.delete("wbsSearch");

    if (bid && bid !== "__all__") sp.set("budgetId", bid);
    if (from) sp.set("dateFrom", from);
    if (to) sp.set("dateTo", to);
    if (wbsSearch) sp.set("wbsSearch", wbsSearch);

    const q = sp.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  function clear() {
    cancelPending();
    if (searchInput.current) searchInput.current.value = "";
    router.push(pathname);
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      {budgets.length > 1 && (
        <div className="w-full min-w-0 space-y-1 sm:w-auto">
          <Label htmlFor="cost-filter-budget" className="text-xs">Presupuesto</Label>
          <Select
            key={currentBudgetId ?? "principal"}
            name="budgetId"
            defaultValue={defaultContractualBudgetId(budgets, currentBudgetId)}
          >
            <SelectTrigger id="cost-filter-budget" className="h-8 w-full text-xs sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {budgets.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {budgetFilterOptionLabel(b)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="cost-filter-from" className="text-xs">Desde</Label>
        <Input
          id="cost-filter-from"
          key={params.get("dateFrom") ?? ""}
          name="dateFrom"
          type="date"
          className="h-8 w-36 text-xs"
          defaultValue={params.get("dateFrom") ?? ""}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cost-filter-to" className="text-xs">Hasta</Label>
        <Input
          id="cost-filter-to"
          key={params.get("dateTo") ?? ""}
          name="dateTo"
          type="date"
          className="h-8 w-36 text-xs"
          defaultValue={params.get("dateTo") ?? ""}
        />
      </div>
      <div className="min-w-56 flex-1 basis-72 space-y-1">
        <Label htmlFor="cost-filter-search" className="text-xs">Buscar EDT</Label>
        <Input
          id="cost-filter-search"
          ref={searchInput}
          name="wbsSearch"
          className="h-8 w-full text-xs"
          placeholder="Código o nombre…"
          defaultValue={wbsSearchDefault}
          onChange={(e) => setWbsSearchDebounced(e.target.value)}
        />
      </div>
      <Button type="submit" size="sm" className="h-8">
        Aplicar
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 text-muted-foreground"
        onClick={clear}
      >
        Limpiar
      </Button>
    </form>
  );
}
