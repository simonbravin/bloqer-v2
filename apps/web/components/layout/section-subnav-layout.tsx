import type { ReactNode } from "react";

/**
 * Layout canónico para módulos con subnav horizontal (Finanzas, Configuración, etc.).
 * La subnav vive en `shell-page`; el contenido de cada página usa `PageShell` aparte.
 */
export function SectionSubnavLayout({
  subnav,
  children,
}: {
  subnav: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-0 min-w-0 w-full">
      <div className="shell-page space-y-0 pb-2 pt-5">{subnav}</div>
      {children}
    </div>
  );
}
