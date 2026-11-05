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
  budgets?: AvailableBudget[];
  currentBudgetId?: string;
  showBudget?: boolean;
  /** When false, hide Desde/Hasta (e.g. materials operativo board uses schedule window, not dates). */
  showDateRange?: boolean;
  showCurrencyView?: boolean;
  currencies?: string[];
  currentCurrency?: string;
};

export function ReportDateFilters({
  budgets = [],
  currentBudgetId,
  showBudget = true,
  showDateRange = true,
  showCurrencyView = false,
  currencies = [],
  currentCurrency,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const resolvedBudgetId = defaultContractualBudgetId(budgets, currentBudgetId);
  const currencyView = params.get("currencyView") === "original" ? "original" : "ARS";
  const [resetVersion, setResetVersion] = useState(0);
  const showCurrencySelect = !showCurrencyView && currencies.length > 1;

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
    const bid = fd.get("budgetId");
    const from = fd.get("dateFrom") as string;
    const to = fd.get("dateTo") as string;
    if (showBudget && typeof bid === "string" && bid && bid !== "__all__") sp.set("budgetId", bid);
    if (showDateRange && from) sp.set("dateFrom", from);
    if (showDateRange && to) sp.set("dateTo", to);
    if (showCurrencyView) sp.set("currencyView", String(fd.get("currencyView") ?? currencyView));
    else if (params.get("currencyView")) sp.set("currencyView", params.get("currencyView")!);
    const currency = fd.get("currency");
    if (showCurrencySelect && typeof currency === "string" && currencies.includes(currency)) {
      sp.set("currency", currency);
    }
    router.push(`${pathname}?${sp.toString()}`);
  }

  function clear() {
    setResetVersion((version) => version + 1);
    const sp = preservedParams();
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const showBudgetSelect = showBudget && budgets.length > 1;
  if (!showBudgetSelect && !showDateRange && !showCurrencyView && !showCurrencySelect) return null;

  return (
    <form
      key={JSON.stringify([params.toString(), resolvedBudgetId, currentCurrency, resetVersion])}
      onSubmit={apply}
      className={REPORT_FILTER_FORM_CLASS}
    >
      {showBudgetSelect ? (
        <div className={REPORT_FILTER_FIELD_CLASS}>
          <Label className="text-xs" htmlFor="report-budget-filter">
            Presupuesto
          </Label>
          <Select name="budgetId" defaultValue={resolvedBudgetId}>
            <SelectTrigger id="report-budget-filter" className={`${REPORT_FILTER_CONTROL_CLASS} sm:w-72`}>
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
      ) : null}
      {showDateRange ? (
        <>
          <div className={REPORT_FILTER_FIELD_CLASS}>
            <Label className="text-xs" htmlFor="report-date-from">
              Desde
            </Label>
            <Input
              id="report-date-from"
              name="dateFrom"
              type="date"
              className={REPORT_FILTER_CONTROL_CLASS}
              defaultValue={params.get("dateFrom") ?? ""}
            />
          </div>
          <div className={REPORT_FILTER_FIELD_CLASS}>
            <Label className="text-xs" htmlFor="report-date-to">
              Hasta
            </Label>
            <Input
              id="report-date-to"
              name="dateTo"
              type="date"
              className={REPORT_FILTER_CONTROL_CLASS}
              defaultValue={params.get("dateTo") ?? ""}
            />
          </div>
        </>
      ) : null}
      {showCurrencyView ? (
        <div className={REPORT_FILTER_FIELD_CLASS}>
          <Label className="text-xs" htmlFor="report-currency-view">
            Moneda
          </Label>
          <Select name="currencyView" defaultValue={currencyView}>
            <SelectTrigger id="report-currency-view" className={`${REPORT_FILTER_CONTROL_CLASS} sm:w-36`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ARS">Consolidado ARS</SelectItem>
              <SelectItem value="original">Por moneda</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {showCurrencySelect ? (
        <div className={REPORT_FILTER_FIELD_CLASS}>
          <Label className="text-xs" htmlFor="report-currency">
            Moneda
          </Label>
          <Select name="currency" defaultValue={currentCurrency}>
            <SelectTrigger id="report-currency" className={REPORT_FILTER_CONTROL_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((currency) => (
                <SelectItem key={currency} value={currency}>{currency}</SelectItem>
              ))}
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
