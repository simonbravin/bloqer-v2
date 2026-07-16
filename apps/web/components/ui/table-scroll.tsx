import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Contenedor estándar para tablas de listados y reportes.
 * Scroll horizontal en pantallas chicas. Con `stickyFirstColumn`, la primera
 * columna queda fija (los consumidores deben marcar `th`/`td` con
 * `sticky left-0 z-10 bg-card` o `bg-muted/50` en header).
 */
export function TableScroll({
  children,
  className,
  stickyFirstColumn = false,
}: {
  children: ReactNode;
  className?: string;
  stickyFirstColumn?: boolean;
}) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-lg border bg-card",
        stickyFirstColumn &&
          "[&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-20 [&_th:first-child]:bg-muted/80 [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}
