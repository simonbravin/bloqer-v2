"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  label: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Shared on/off row for policy / settings screens.
 * Layout styles: `.switch-field` in `globals.css`.
 */
export function SwitchField({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: Props) {
  return (
    <div className={cn("switch-field", className)}>
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id} className="switch-field-label">
          {label}
        </Label>
        {description ? (
          <div className="switch-field-description">{description}</div>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="mt-0.5 shrink-0"
        aria-label={label}
      />
    </div>
  );
}
