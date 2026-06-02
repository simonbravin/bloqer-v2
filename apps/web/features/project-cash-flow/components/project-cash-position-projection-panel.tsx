"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import type { ProjectCashPositionProjectionReport } from "@bloqer/services";

const PROJECTION_ANCHOR = "proyeccion-caja";

type Props = {
  projectId: string;
  report: ProjectCashPositionProjectionReport | null;
  /** ISO date from URL; when set the panel loads KPI data. */
  active: boolean;
  appliedAsOfDate: string;
};

function toneByAmount(value: string): "success" | "danger" | "muted" {
  const num = Number.parseFloat(value);
  if (num > 0) return "success";
  if (num < 0) return "danger";
  return "muted";
}

export function ProjectCashPositionProjectionPanel({
  projectId,
  report,
  active,
  appliedAsOfDate,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const appliedFromUrl = sp.get("projectionDate") ?? appliedAsOfDate;
  const [draftDate, setDraftDate] = useState(appliedFromUrl);

  useEffect(() => {
    setDraftDate(appliedFromUrl);
  }, [appliedFromUrl]);

  function pushParams(next: URLSearchParams) {
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}#${PROJECTION_ANCHOR}` : `${pathname}#${PROJECTION_ANCHOR}`);
  }

  function applyDate() {
    const params = new URLSearchParams(sp.toString());
    if (draftDate) params.set("projectionDate", draftDate);
    else params.delete("projectionDate");
    pushParams(params);
  }

  function clearProjection() {
    const params = new URLSearchParams(sp.toString());
    params.delete("projectionDate");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const row =
    report?.currencies.find((c) => c.currency === (sp.get("currency") ?? "")) ??
    report?.currencies.find((c) => c.currency === "ARS") ??
    report?.currencies[0];

  const asOfLabel = formatDate(report?.asOfDate ?? appliedAsOfDate);

  return (
    <div id={PROJECTION_ANCHOR} className="scroll-mt-6">
      <Accordion
        type="single"
        collapsible
        defaultValue={active ? "proyeccion" : undefined}
        className="rounded-lg border bg-card"
      >
        <AccordionItem value="proyeccion" className="border-0">
          <AccordionTrigger className="px-4 py-3 text-sm font-semibold hover:no-underline">
            Proyección de caja
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-0 space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Proyección de caja (proyecto)</h3>
              <p className="text-xs text-muted-foreground">
                Posición estimada a una fecha: movimientos confirmados más saldos abiertos de CxC y CxP
                con vencimiento en o antes de esa fecha.
              </p>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Filtros
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fecha de proyección</Label>
                  <Input
                    type="date"
                    value={draftDate}
                    onChange={(e) => setDraftDate(e.target.value)}
                    className="w-40"
                  />
                </div>
                <Button type="button" size="sm" onClick={applyDate}>
                  Aplicar
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearProjection}>
                  Limpiar
                </Button>
              </div>
            </div>

            {!active ? (
              <p className="text-sm text-muted-foreground">
                Elegí una fecha y presioná Aplicar para ver los indicadores.
              </p>
            ) : !row ? (
              <p className="text-sm text-muted-foreground">
                Sin movimientos ni obligaciones abiertas para la fecha seleccionada.
              </p>
            ) : (
              <>
                {report && report.warnings.length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    {report.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}

                <KpiStatGrid title={null} columns={4}>
                  <KpiStatCard
                    label="Cobros recibidos hasta la fecha"
                    value={formatMoneyAmount(row.collectionsReceived, row.currency)}
                    tone="success"
                  />
                  <KpiStatCard
                    label="Pagos realizados hasta la fecha"
                    value={formatMoneyAmount(row.paymentsMade, row.currency)}
                    tone="danger"
                  />
                  <KpiStatCard
                    label="Cuentas por cobrar (vencimiento ≤ fecha)"
                    value={formatMoneyAmount(row.receivablesDue, row.currency)}
                    helper={
                      row.receivableOpenCount > 0
                        ? `${row.receivableOpenCount} documento(s) abierto(s)`
                        : undefined
                    }
                  />
                  <KpiStatCard
                    label="Cuentas por pagar (vencimiento ≤ fecha)"
                    value={formatMoneyAmount(row.payablesDue, row.currency)}
                    helper={
                      row.payableOpenCount > 0
                        ? `${row.payableOpenCount} documento(s) abierto(s)`
                        : undefined
                    }
                  />
                </KpiStatGrid>

                <KpiStatCard
                  label={`Capital proyectado a ${asOfLabel}`}
                  value={formatMoneyAmount(row.projectedCapital, row.currency)}
                  tone={toneByAmount(row.projectedCapital)}
                  variant="highlight"
                  helper="Cobros recibidos − Pagos realizados + Cuentas por cobrar − Cuentas por pagar"
                  className="w-full"
                />

                {report && report.currencies.length > 1 && (
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    El proyecto tiene obligaciones en {report.currencies.length} monedas. Se muestra{" "}
                    {row.currency}; usá el filtro de moneda del reporte principal para cambiar.
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/proyectos/${projectId}/cuentas-por-cobrar`}>Ver CxC</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/proyectos/${projectId}/cuentas-por-pagar`}>Ver CxP</Link>
                  </Button>
                </div>
              </>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
