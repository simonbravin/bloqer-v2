"use client";

import Link from "next/link";
import { ReportExportActions } from "@/features/reports/report-export-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ExportParams = Record<string, string | string[] | undefined>;

type MaterialsToolbarProps = {
  projectId: string;
  showCompras: boolean;
  showConsumos: boolean;
} & (
  | { mode: "field" }
  | {
      mode: "desktop";
      tab: "operativo" | "varianza";
      operativoHref: string;
      varianzaHref: string;
      showExport: boolean;
      exportParams: ExportParams;
    }
);

const SCROLL_CLUSTER =
  "flex min-w-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain touch-pan-x py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_a]:shrink-0 [&_button]:shrink-0";

function ShortcutLink({
  href,
  label,
  shortLabel,
}: {
  href: string;
  label: string;
  shortLabel?: string;
}) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href} title={label}>
        {shortLabel ? (
          <>
            <span className="lg:hidden" aria-hidden>
              {shortLabel}
            </span>
            <span className="hidden lg:inline">{label}</span>
            <span className="sr-only lg:hidden">{label}</span>
          </>
        ) : (
          label
        )}
      </Link>
    </Button>
  );
}

function MaterialsShortcuts({
  projectId,
  showCompras,
  showConsumos,
  showExport,
  exportParams,
}: {
  projectId: string;
  showCompras: boolean;
  showConsumos: boolean;
  showExport: boolean;
  exportParams?: ExportParams;
}) {
  return (
    <>
      {showExport && exportParams ? (
        <ReportExportActions
          exportPath={`/api/reports/proyectos/${projectId}/materiales.csv`}
          params={exportParams}
          pdf
        />
      ) : null}
      <ShortcutLink
        href={`/proyectos/${projectId}/control-costos`}
        label="EDT y costos"
        shortLabel="EDT"
      />
      {showCompras ? (
        <ShortcutLink
          href={`/proyectos/${projectId}/compras`}
          label="Tablero de compras"
          shortLabel="Compras"
        />
      ) : null}
      {showConsumos ? (
        <ShortcutLink href={`/proyectos/${projectId}/consumos`} label="Consumos" />
      ) : null}
    </>
  );
}

export function MaterialsToolbar(props: MaterialsToolbarProps) {
  const shortcuts = (
    <MaterialsShortcuts
      projectId={props.projectId}
      showCompras={props.showCompras}
      showConsumos={props.showConsumos}
      showExport={props.mode === "desktop" && props.showExport}
      exportParams={props.mode === "desktop" ? props.exportParams : undefined}
    />
  );

  if (props.mode === "field") {
    return (
      <nav aria-label="Atajos de materiales" className={SCROLL_CLUSTER} data-testid="materials-toolbar">
        {shortcuts}
      </nav>
    );
  }

  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-2" data-testid="materials-toolbar">
      <div
        role="tablist"
        aria-label="Vistas de materiales"
        className="inline-flex h-9 shrink-0 items-center rounded-lg bg-muted p-0.5"
      >
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 shadow-none",
            props.tab === "operativo" && "bg-background text-foreground shadow-sm hover:bg-background",
          )}
          asChild
        >
          <Link href={props.operativoHref} role="tab" aria-selected={props.tab === "operativo"}>
            Operativo
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 shadow-none",
            props.tab === "varianza" && "bg-background text-foreground shadow-sm hover:bg-background",
          )}
          asChild
        >
          <Link href={props.varianzaHref} role="tab" aria-selected={props.tab === "varianza"}>
            Varianza ($)
          </Link>
        </Button>
      </div>
      <nav aria-label="Atajos de materiales" className={cn(SCROLL_CLUSTER, "ml-auto justify-end")}>
        {shortcuts}
      </nav>
    </div>
  );
}
