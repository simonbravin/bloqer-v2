import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Título opcional encima de una tabla con borde (`TableScroll`). */
export function DataTableSection({
  title,
  actions,
  children,
  className,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-base font-semibold">{title}</h2> : <span />}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
