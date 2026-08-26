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
import {
  REPORT_FILTER_CONTROL_CLASS,
  REPORT_FILTER_FIELD_CLASS,
  REPORT_FILTER_FORM_CLASS,
} from "./report-layout";

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
    <form onSubmit={apply} className={REPORT_FILTER_FORM_CLASS}>
      {budgets.length > 1 && (
        <div className={REPORT_FILTER_FIELD_CLASS}>
          <Label className="text-xs">Presupuesto</Label>
          <Select name="budgetId" defaultValue={currentBudgetId ?? "__all__"}>
            <SelectTrigger className={`${REPORT_FILTER_CONTROL_CLASS} sm:w-52`}>
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
      <div className={REPORT_FILTER_FIELD_CLASS}>
        <Label className="text-xs">Capa de costo</Label>
        <Select name="costLayer" defaultValue={currentLayer}>
          <SelectTrigger className={REPORT_FILTER_CONTROL_CLASS}>
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
      <div className={REPORT_FILTER_FIELD_CLASS}>
        <Label className="text-xs">Desde</Label>
        <Input
          name="dateFrom"
          type="date"
          className={REPORT_FILTER_CONTROL_CLASS}
          defaultValue={params.get("dateFrom") ?? ""}
        />
      </div>
      <div className={REPORT_FILTER_FIELD_CLASS}>
        <Label className="text-xs">Hasta</Label>
        <Input
          name="dateTo"
          type="date"
          className={REPORT_FILTER_CONTROL_CLASS}
          defaultValue={params.get("dateTo") ?? ""}
        />
      </div>
      <div className={REPORT_FILTER_FIELD_CLASS}>
        <Label className="text-xs">Buscar partida</Label>
        <Input
          name="wbsSearch"
          className={`${REPORT_FILTER_CONTROL_CLASS} sm:w-40`}
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
