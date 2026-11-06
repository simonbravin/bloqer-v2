import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Marco para las tablas de listados y reportes. `Table` controla el scroll.
 * Con `stickyFirstColumn`, la primera columna de la tabla directa queda fija.
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
        "w-full min-w-0 overflow-x-auto rounded-lg border bg-card has-[>[data-table-viewport]]:overflow-clip",
        stickyFirstColumn && [
          "[&>[data-table-viewport]>table>*>tr>:first-child:not(:only-child[colspan])]:sticky",
          "[&>[data-table-viewport]>table>*>tr>:first-child:not(:only-child[colspan])]:left-0",
          "[&>[data-table-viewport]>table>*>tr>th:first-child:not(:only-child[colspan])]:z-20",
          "[&>[data-table-viewport]>table>*>tr>th:first-child:not(:only-child[colspan])]:bg-muted",
          "[&>[data-table-viewport]>table>*>tr>td:first-child:not(:only-child[colspan])]:z-10",
          "[&>[data-table-viewport]>table>*>tr>td:first-child:not(:only-child[colspan])]:bg-card",
        ],
        className,
      )}
    >
      {children}
    </div>
  );
}
