import type { ReactNode } from "react";
import {
  resolveDetailFieldIcon,
  type DetailFieldIconAccent,
  type DetailFieldIconKey,
} from "@/lib/detail-field-icon";
import { cn } from "@/lib/utils";

export type { DetailFieldIconKey, DetailFieldIconAccent };

export function DetailFieldGrid({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const cols =
    columns === 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : columns === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2";

  return (
    <dl className={cn("grid grid-cols-1 gap-4 text-sm", cols, className)}>
      {children}
    </dl>
  );
}

export function DetailField({
  label,
  iconKey,
  iconAccent,
  children,
  className,
  fullWidth,
}: {
  label: string;
  /** Optional semantic icon (client, address, dates, etc.). */
  iconKey?: DetailFieldIconKey;
  /** Override icon accent (e.g. muted when value is empty). */
  iconAccent?: DetailFieldIconAccent;
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
}) {
  const iconMeta = iconKey ? resolveDetailFieldIcon(iconKey, iconAccent) : null;
  const IconComponent = iconMeta?.Icon;
  const labelId = iconKey ? `detail-field-${iconKey}-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined;

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn(fullWidth && "col-span-full", className)}
    >
      <dt className="flex items-center gap-2 text-muted-foreground">
        {IconComponent && iconMeta ? (
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              iconMeta.accentClass.container,
            )}
            aria-hidden
          >
            <IconComponent className={cn("h-3.5 w-3.5", iconMeta.accentClass.icon)} />
          </span>
        ) : null}
        <span id={labelId}>{label}</span>
      </dt>
      <dd className={cn("mt-1 font-medium break-words", iconMeta && "pl-9")}>{children}</dd>
    </div>
  );
}
