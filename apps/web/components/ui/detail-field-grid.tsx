import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
  children,
  className,
  fullWidth,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={cn(fullWidth && "sm:col-span-2 lg:col-span-full", className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}
