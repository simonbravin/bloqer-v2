"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import type { ProjectProgressReport } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { DateRangePresets } from "@/components/ui/date-range-presets";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  budgets: ProjectProgressReport["availableBudgets"];
  currencies: string[];
  budgetId?: string;
  currency: string;
  dateFrom: string;
  dateTo: string;
  maxDate: string;
};

export function ProjectProgressFilters(props: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [budgetId, setBudgetId] = useState(props.budgetId ?? "");
  const [currency, setCurrency] = useState(props.currency);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [dateTo, setDateTo] = useState(props.dateTo);

  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams({ dateFrom, dateTo, currency });
    if (budgetId) query.set("budgetId", budgetId);
    router.push(`${pathname}?${query.toString()}`);
  }

  return (
    <section aria-label="Filtros del reporte" className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
          Alcance del reporte
        </div>
        <DateRangePresets
          defaultPreset={null}
          onRangeChange={(range) => {
            setDateFrom(range.dateFrom);
            setDateTo(range.dateTo);
          }}
        />
      </div>
      <form
        onSubmit={apply}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,2fr)_minmax(8rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_auto] xl:items-end"
      >
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="progress-budget" className="text-xs">
            Presupuesto
          </Label>
          <select
            id="progress-budget"
            value={budgetId}
            onChange={(event) => {
              const id = event.target.value;
              setBudgetId(id);
              const selected = props.budgets.find((budget) => budget.id === id);
              if (selected) setCurrency(selected.currency);
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos en la moneda seleccionada</option>
            {props.budgets.map((budget) => (
              <option key={budget.id} value={budget.id}>
                {budget.name} · {budget.currency}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="progress-currency" className="text-xs">
            Moneda
          </Label>
          <select
            id="progress-currency"
            value={currency}
            onChange={(event) => {
              setCurrency(event.target.value);
              setBudgetId("");
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {props.currencies.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="progress-from" className="text-xs">
            Movimientos desde
          </Label>
          <Input
            id="progress-from"
            type="date"
            required
            value={dateFrom}
            max={dateTo}
            onChange={(event) => setDateFrom(event.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="progress-to" className="text-xs">
            Fecha de corte
          </Label>
          <Input
            id="progress-to"
            type="date"
            required
            value={dateTo}
            min={dateFrom}
            max={props.maxDate}
            onChange={(event) => setDateTo(event.target.value)}
            className="h-9"
          />
        </div>
        <div className="flex items-center gap-1 sm:col-span-2 xl:col-span-1">
          <Button type="submit" size="sm" className="h-9">
            Aplicar
          </Button>
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href={pathname}>Limpiar</Link>
          </Button>
        </div>
      </form>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Los indicadores muestran el acumulado a la fecha de corte. Desde define la ventana de
        evolución; el saldo anterior se conserva. Cada moneda se consulta por separado.
      </p>
    </section>
  );
}
