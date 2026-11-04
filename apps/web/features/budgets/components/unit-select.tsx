"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BUDGET_UNIT_OPTIONS, isKnownBudgetUnit } from "@/lib/budget-units";

interface UnitSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function UnitSelect({
  id,
  value,
  onChange,
  disabled,
  placeholder = "Unidad",
  className,
}: UnitSelectProps) {
  const selectValue = !value
    ? undefined
    : isKnownBudgetUnit(value)
      ? value
      : "__custom__";

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => {
        if (v !== "__custom__") onChange(v);
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {BUDGET_UNIT_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
        {value && !isKnownBudgetUnit(value) ? (
          <SelectItem value="__custom__">{value} (actual)</SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );
}
