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
import { useDebouncedSearchParam } from "@/hooks/use-debounced-search-param";
import type { AvailableBudget } from "@bloqer/services";

type Props = {
  budgets: AvailableBudget[];
  currentBudgetId?: string;
};

export function CostControlFilters({ budgets, currentBudgetId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { defaultValue: wbsSearchDefault, setDebounced: setWbsSearchDebounced } =
    useDebouncedSearchParam("wbsSearch");

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sp = new URLSearchParams(params.toString());
    const bid = fd.get("budgetId") as string;
    const from = fd.get("dateFrom") as string;
    const to = fd.get("dateTo") as string;

    sp.delete("budgetId");
    sp.delete("dateFrom");
    sp.delete("dateTo");

    if (bid && bid !== "__all__") sp.set("budgetId", bid);
    if (from) sp.set("dateFrom", from);
    if (to) sp.set("dateTo", to);

    const q = sp.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
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
            <SelectTrigger className="h-8 w-52 text-xs">
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
          className="h-8 w-36 text-xs"
          defaultValue={params.get("dateFrom") ?? ""}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Hasta</Label>
        <Input
          name="dateTo"
          type="date"
          className="h-8 w-36 text-xs"
          defaultValue={params.get("dateTo") ?? ""}
        />
      </div>
      <div className="min-w-56 flex-1 basis-72 space-y-1">
        <Label className="text-xs">Buscar WBS</Label>
        <Input
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
