import type { ReactNode } from "react";

/** Horizontal shortcut row; scrolls on mobile instead of wrapping into a tall stack. */
export function ReportSubnav({ children }: { children: ReactNode }) {
  return (
    <nav
      aria-label="Atajos del reporte"
      className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_a]:shrink-0 [&_button]:shrink-0 sm:flex-wrap sm:overflow-visible"
    >
      {children}
    </nav>
  );
}
