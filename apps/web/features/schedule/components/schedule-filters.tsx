"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
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
import type { ScheduleItemStatus } from "@bloqer/database";
import { STATUS_LABELS } from "../adapters/schedule-view-types";

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
  currentBudgetId: string;
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

  function toggleDelayed() {
    const sp = new URLSearchParams(params.toString());
    if (delayedOnly) sp.delete("delayedOnly");
    else sp.set("delayedOnly", "1");
    push(sp);
  }

  const currentStatus = params.get("status") ?? "ALL";

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      {budgets.length > 1 && (
        <div className="space-y-1">
          <Label className="text-xs">Presupuesto</Label>
          <Select value={currentBudgetId} onValueChange={setBudget}>
            <SelectTrigger className="h-8 w-52 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
        <Label className="text-xs">Estado</Label>
        <Select value={currentStatus} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "ALL" ? "Todos" : (STATUS_LABELS[s] ?? s)}
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
    </div>
  );
}
