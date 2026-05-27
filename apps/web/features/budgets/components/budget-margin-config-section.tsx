"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBudgetSettingsSchema, type UpdateBudgetSettingsInput } from "@bloqer/validators";
import { formatMoneyAmount } from "@/lib/format-money";
import { computeBudgetSaleBreakdown } from "../lib/budget-sale-calc";
import type { SettingsDefaults } from "./budget-settings-form";

interface BudgetMarginConfigSectionProps {
  defaults: SettingsDefaults;
  totalDirectCost: string;
  totalSalePrice: string;
  currency: string;
  editable: boolean;
  onSubmit: (data: UpdateBudgetSettingsInput) => Promise<{ ok: true } | { error: string }>;
}

function fmt(value: number, currency: string) {
  return formatMoneyAmount(String(value), currency);
}

function pctLabel(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function BudgetMarginConfigSection({
  defaults,
  totalDirectCost,
  totalSalePrice,
  currency,
  editable,
  onSubmit,
}: BudgetMarginConfigSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<UpdateBudgetSettingsInput>({
    resolver: zodResolver(updateBudgetSettingsSchema),
    defaultValues: {
      overheadPct: defaults.overheadPct,
      financialCostPct: defaults.financialCostPct,
      profitPct: defaults.profitPct,
      taxPct: defaults.taxPct,
    },
  });

  const watched = form.watch();
  const directCost = parseFloat(totalDirectCost) || 0;
  const overheadPct = pctLabel(watched.overheadPct);
  const financialCostPct = pctLabel(watched.financialCostPct);
  const profitPct = pctLabel(watched.profitPct);
  const taxPct = pctLabel(watched.taxPct);

  const breakdown = useMemo(
    () =>
      computeBudgetSaleBreakdown(directCost, {
        overheadPct,
        financialCostPct,
        profitPct,
        taxPct,
      }),
    [directCost, overheadPct, financialCostPct, profitPct, taxPct],
  );

  const handleSubmit = form.handleSubmit((data) => {
    setServerError(null);
    startTransition(async () => {
      const result = await onSubmit(data);
      if ("error" in result) {
        setServerError(result.error);
        toast.error(result.error);
      } else {
        toast.success("Configuración guardada");
        router.refresh();
      }
    });
  });

  const saleStored = parseFloat(totalSalePrice) || 0;

  return (
    <section id="configuracion" className="rounded-xl border bg-card shadow-sm scroll-mt-6">
      <div className="border-b px-4 py-3">
        <h2 className="text-base font-semibold">Configuración de márgenes</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Modo simple: un solo juego de porcentajes (GG, GF, utilidad, IVA) se aplica a todas las partidas.
          Los gastos financieros (GF) se calculan sobre el subtotal 1 (costo directo + GG).
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 p-4 lg:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Márgenes globales
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Gastos generales %</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                disabled={!editable}
                {...form.register("overheadPct", { valueAsNumber: true })}
              />
              <p className="text-xs font-mono text-muted-foreground">{fmt(breakdown.overhead, currency)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Gastos financieros %</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                disabled={!editable}
                {...form.register("financialCostPct", { valueAsNumber: true })}
              />
              <p className="text-xs font-mono text-muted-foreground">{fmt(breakdown.financialCost, currency)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Utilidad %</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                disabled={!editable}
                {...form.register("profitPct", { valueAsNumber: true })}
              />
              <p className="text-xs font-mono text-muted-foreground">{fmt(breakdown.profit, currency)}</p>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>IVA %</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                disabled={!editable}
                {...form.register("taxPct", { valueAsNumber: true })}
              />
              <p className="text-xs font-mono text-muted-foreground">{fmt(breakdown.tax, currency)}</p>
            </div>
          </div>
          {editable && (
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Guardando..." : "Guardar configuración"}
            </Button>
          )}
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        </div>

        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Desglose de cálculo
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Costo directo</dt>
              <dd className="font-mono tabular-nums">{fmt(breakdown.directCost, currency)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">+ GG ({overheadPct}%)</dt>
              <dd className="font-mono tabular-nums">{fmt(breakdown.overhead, currency)}</dd>
            </div>
            <div className="flex justify-between gap-2 font-medium">
              <dt>Subtotal 1</dt>
              <dd className="font-mono tabular-nums">{fmt(breakdown.subtotal1, currency)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">+ GF ({financialCostPct}%)</dt>
              <dd className="font-mono tabular-nums">{fmt(breakdown.financialCost, currency)}</dd>
            </div>
            <div className="flex justify-between gap-2 font-medium">
              <dt>Subtotal 2</dt>
              <dd className="font-mono tabular-nums">{fmt(breakdown.subtotal2, currency)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">+ Utilidad ({profitPct}%)</dt>
              <dd className="font-mono tabular-nums">{fmt(breakdown.profit, currency)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">+ IVA ({taxPct}%)</dt>
              <dd className="font-mono tabular-nums">{fmt(breakdown.tax, currency)}</dd>
            </div>
            <div className="flex justify-between gap-2 border-t pt-2 text-base font-bold">
              <dt>TOTAL DE VENTA (calc.)</dt>
              <dd className="font-mono tabular-nums">{fmt(breakdown.totalSale, currency)}</dd>
            </div>
            <div className="flex justify-between gap-2 text-xs text-muted-foreground">
              <dt>Total venta en presupuesto</dt>
              <dd className="font-mono tabular-nums">{fmt(saleStored, currency)}</dd>
            </div>
          </dl>
        </div>
      </form>
    </section>
  );
}
