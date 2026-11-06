import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageListHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between", className)}>
      <div className="min-w-0 max-w-full flex-1 sm:basis-[min-content]">
        <h1 className="break-words text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <div className="mt-1 break-words text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
