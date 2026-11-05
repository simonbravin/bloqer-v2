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
import { CurrencyFilterSelect } from "@/components/ui/currency-select";

export function CashFlowFilters({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const router   = useRouter();
  const pathname = usePathname();
  const sp       = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="cash-flow-from" className="text-xs text-muted-foreground">Desde</Label>
        <Input
          id="cash-flow-from"
          key={dateFrom}
          type="date"
          defaultValue={dateFrom}
          onChange={(e) => update("dateFrom", e.target.value)}
          className="w-36"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cash-flow-to" className="text-xs text-muted-foreground">Hasta</Label>
        <Input
          id="cash-flow-to"
          key={dateTo}
          type="date"
          defaultValue={dateTo}
          onChange={(e) => update("dateTo", e.target.value)}
          className="w-36"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cash-flow-currency" className="text-xs text-muted-foreground">Moneda</Label>
        <CurrencyFilterSelect
          id="cash-flow-currency"
          value={sp.get("currency") ?? ""}
          onValueChange={(v) => update("currency", v)}
          triggerClassName="w-[14rem]"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cash-flow-period" className="text-xs text-muted-foreground">Agrupación</Label>
        <Select
          value={sp.get("period") ?? "month"}
          onValueChange={(v) => update("period", v)}
        >
          <SelectTrigger id="cash-flow-period" className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Diario</SelectItem>
            <SelectItem value="week">Semanal</SelectItem>
            <SelectItem value="month">Mensual</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(pathname)}
        className="self-end"
      >
        Limpiar
      </Button>
    </div>
  );
}
