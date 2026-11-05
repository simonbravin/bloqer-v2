"use client";

import { useState } from "react";
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
import {
  budgetFilterOptionLabel,
  defaultContractualBudgetId,
} from "@/features/budgets/components/budget-status-badge";
import {
  REPORT_FILTER_CONTROL_CLASS,
  REPORT_FILTER_FIELD_CLASS,
  REPORT_FILTER_FORM_CLASS,
} from "./report-layout";
type Props = {
  budgets: AvailableBudget[];
  currentBudgetId?: string;
  currentCostLayer?: string;
  currentRevenueBasis?: string;
  currentCurrencyView?: string;
};

export function ProfitabilityFilters({
  budgets,
  currentBudgetId,
  currentCostLayer,
  currentRevenueBasis,
  currentCurrencyView,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [resetVersion, setResetVersion] = useState(0);

  function apply(form: {
    budgetId?: string;
    costLayer: string;
    revenueBasis: string;
    currencyView: string;
  }) {
    const sp = new URLSearchParams();
    if (form.budgetId && form.budgetId !== "__all__") sp.set("budgetId", form.budgetId);
    sp.set("costLayer", form.costLayer);
    sp.set("revenueBasis", form.revenueBasis);
    sp.set("currencyView", form.currencyView);
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <form
      key={JSON.stringify([currentBudgetId, currentCostLayer, currentRevenueBasis, currentCurrencyView, resetVersion])}
      className={REPORT_FILTER_FORM_CLASS}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        apply({
          budgetId: (fd.get("budgetId") as string) || undefined,
          costLayer: (fd.get("costLayer") as string) || "exposure",
          revenueBasis: (fd.get("revenueBasis") as string) || "certified",
          currencyView: (fd.get("currencyView") as string) || "ARS",
        });
      }}
    >
        {budgets.length > 1 && (
          <div className={REPORT_FILTER_FIELD_CLASS}>
            <Label className="text-xs" htmlFor="profitability-budget">Presupuesto</Label>
            <Select
              key={currentBudgetId ?? "principal"}
              name="budgetId"
              defaultValue={defaultContractualBudgetId(budgets, currentBudgetId)}
            >
              <SelectTrigger id="profitability-budget" className={`${REPORT_FILTER_CONTROL_CLASS} sm:w-72`}>
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
        <div className={REPORT_FILTER_FIELD_CLASS}>
          <Label className="text-xs" htmlFor="profitability-cost-layer">Capa de costo</Label>
          <Select name="costLayer" defaultValue={currentCostLayer ?? "exposure"}>
            <SelectTrigger id="profitability-cost-layer" className={REPORT_FILTER_CONTROL_CLASS}>
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
        <div className={REPORT_FILTER_FIELD_CLASS}>
          <Label className="text-xs" htmlFor="profitability-revenue-basis">Base de ingresos</Label>
          <Select name="revenueBasis" defaultValue={currentRevenueBasis ?? "certified"}>
            <SelectTrigger id="profitability-revenue-basis" className={REPORT_FILTER_CONTROL_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="certified">Certificado</SelectItem>
              <SelectItem value="invoiced">Facturado neto</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className={REPORT_FILTER_FIELD_CLASS}>
          <Label className="text-xs" htmlFor="profitability-currency">Moneda</Label>
          <Select name="currencyView" defaultValue={currentCurrencyView ?? "ARS"}>
            <SelectTrigger id="profitability-currency" className={`${REPORT_FILTER_CONTROL_CLASS} sm:w-36`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ARS">Consolidado ARS</SelectItem>
              <SelectItem value="original">Por moneda</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="sm" className="h-8">
          Aplicar
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => {
          setResetVersion((version) => version + 1);
          router.push(pathname);
        }}>
          Restablecer
        </Button>
    </form>
  );
}
