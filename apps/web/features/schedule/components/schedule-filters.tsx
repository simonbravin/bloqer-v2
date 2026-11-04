"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ScheduleItemStatus } from "@bloqer/database";
import type { AvailableBudget } from "@bloqer/services";
import { budgetFilterOptionLabel } from "@/features/budgets/components/budget-status-badge";
import { STATUS_LABELS } from "../adapters/schedule-view-types";
import { ScheduleProgressLegend } from "./schedule-progress-dimensions";

const STATUS_OPTIONS: (ScheduleItemStatus | "ALL")[] = [
  "ALL",
  "PLANNED",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
];

type Props = {
  budgets: AvailableBudget[];
  currentBudgetId: string | null;
  delayedOnly: boolean;
};

export function ScheduleFilters({ budgets, currentBudgetId, delayedOnly }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function push(next: URLSearchParams) {
    const q = next.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  function setBudget(budgetId: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("budgetId", budgetId);
    push(sp);
  }

  function setStatus(status: string) {
    const sp = new URLSearchParams(params.toString());
    if (status === "ALL") sp.delete("status");
    else sp.set("status", status);
    push(sp);
  }

  function setItemType(type: string) {
    const sp = new URLSearchParams(params.toString());
    if (type === "ALL") sp.delete("type");
    else sp.set("type", type);
    push(sp);
  }

  function toggleDelayed() {
    const sp = new URLSearchParams(params.toString());
    if (delayedOnly) sp.delete("delayedOnly");
    else sp.set("delayedOnly", "1");
    push(sp);
  }

  const rawStatus = params.get("status");
  const currentStatus = STATUS_OPTIONS.includes(rawStatus as ScheduleItemStatus) ? rawStatus! : "ALL";
  const rawType = params.get("type");
  const currentType = rawType === "TASK" || rawType === "MILESTONE" ? rawType : "ALL";

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      {budgets.length > 1 && (
        <div className="w-full min-w-0 space-y-1 sm:w-auto">
          <Label htmlFor="schedule-filter-budget" className="text-xs">Presupuesto</Label>
          <Select value={currentBudgetId ?? ""} onValueChange={setBudget}>
            <SelectTrigger id="schedule-filter-budget" className="h-8 w-full text-xs sm:w-72">
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
        <Label htmlFor="schedule-filter-type" className="text-xs">Tipo</Label>
        <Select value={currentType} onValueChange={setItemType}>
          <SelectTrigger id="schedule-filter-type" className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="TASK">Tareas</SelectItem>
            <SelectItem value="MILESTONE">Hitos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="schedule-filter-status" className="text-xs">Estado</Label>
        <Select value={currentStatus} onValueChange={setStatus}>
          <SelectTrigger id="schedule-filter-status" className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "ALL"
                  ? "Activos (sin canceladas)"
                  : (STATUS_LABELS[s] ?? s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        variant={delayedOnly ? "secondary" : "outline"}
        size="sm"
        className="h-8"
        onClick={toggleDelayed}
      >
        {delayedOnly ? "Solo atrasados ✓" : "Solo atrasados"}
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
            Leyenda de avances
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(24rem,90vw)] text-sm">
          <ScheduleProgressLegend />
        </PopoverContent>
      </Popover>
    </div>
  );
}
