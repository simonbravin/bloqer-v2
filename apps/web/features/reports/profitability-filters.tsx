"use client";

import { useRouter, usePathname } from "next/navigation";
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
  budgets: AvailableBudget[];
  currentBudgetId?: string;
  currentCostLayer?: string;
  currentRevenueBasis?: string;
};

export function ProfitabilityFilters({
  budgets,
  currentBudgetId,
  currentCostLayer,
  currentRevenueBasis,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function apply(form: { budgetId?: string; costLayer: string; revenueBasis: string }) {
    const sp = new URLSearchParams();
    if (form.budgetId && form.budgetId !== "__all__") sp.set("budgetId", form.budgetId);
    sp.set("costLayer", form.costLayer);
    sp.set("revenueBasis", form.revenueBasis);
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        apply({
          budgetId: (fd.get("budgetId") as string) || undefined,
          costLayer: (fd.get("costLayer") as string) || "accrued",
          revenueBasis: (fd.get("revenueBasis") as string) || "certified",
        });
      }}
    >
        {budgets.length > 1 && (
          <div className="space-y-1">
            <Label className="text-xs">Presupuesto</Label>
            <Select name="budgetId" defaultValue={currentBudgetId ?? budgets[0]?.id ?? "__all__"}>
              <SelectTrigger className="w-52 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {budgets.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Capa de costo</Label>
          <Select name="costLayer" defaultValue={currentCostLayer ?? "accrued"}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exposure">Exposición esperada</SelectItem>
              <SelectItem value="committed">Comprometido</SelectItem>
              <SelectItem value="accrued">Devengado</SelectItem>
              <SelectItem value="paid">Pagado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Base ingresos</Label>
          <Select name="revenueBasis" defaultValue={currentRevenueBasis ?? "certified"}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="certified">Certificado</SelectItem>
              <SelectItem value="invoiced">Facturado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="sm" className="h-8">
          Aplicar
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => router.push(pathname)}>
          Restablecer
        </Button>
    </form>
  );
}
