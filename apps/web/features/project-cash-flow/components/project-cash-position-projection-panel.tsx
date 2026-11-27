"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ProjectCashPositionProjectionContext, ProjectCashPositionProjectionReport } from "@bloqer/services";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount, moneyAmountTone } from "@/lib/format-money";

const PROJECTION_ANCHOR = "proyeccion-caja";

type Props = {
  projectId: string;
  report: ProjectCashPositionProjectionReport | null;
  active: boolean;
  appliedAsOfDate: string;
  context: ProjectCashPositionProjectionContext;
};

export function ProjectCashPositionProjectionPanel({ projectId, report, active, appliedAsOfDate, context }: Props) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const appliedDate = sp.get("projectionDate") ?? appliedAsOfDate;
  const appliedDelay = sp.get("projectionCollectionDelayDays");
  const [draftDate, setDraftDate] = useState(appliedDate);
  const [compare, setCompare] = useState(appliedDelay !== null);
  const [draftDelay, setDraftDelay] = useState(appliedDelay ?? "0");
  const [expanded, setExpanded] = useState(active ? "proyeccion" : "");

  useEffect(() => {
    if (window.location.hash === `#${PROJECTION_ANCHOR}`) setExpanded("proyeccion");
  }, []);

  useEffect(() => {
    setDraftDate(appliedDate);
    setCompare(appliedDelay !== null);
    setDraftDelay(appliedDelay ?? "0");
  }, [appliedDate, appliedDelay]);

  // The URL is this report's read contract. A complete GET avoids the stalled
  // RSC transitions observed in CI; see the implementation plan, section 25.
  const baseParams = new URLSearchParams(sp.toString());
  baseParams.delete("projectionDate");
  baseParams.delete("projectionCollectionDelayDays");
  const baseQuery = baseParams.toString();
  const clearHref = `${pathname}${baseQuery ? `?${baseQuery}` : ""}#${PROJECTION_ANCHOR}`;
  function clearDraft() {
    setDraftDate(context.today);
    setCompare(false);
    setDraftDelay("0");
  }

  const inflowsAvailable = context.receivablesAvailable;
  const outflowsAvailable = context.payablesAvailable;
  const partial = !inflowsAvailable || !outflowsAvailable;
  const asOfLabel = formatDate(report?.asOfDate ?? appliedAsOfDate);
  const dirty = draftDate !== appliedDate || compare !== (appliedDelay !== null) ||
    (compare && draftDelay !== (appliedDelay ?? "0"));

  return <div id={PROJECTION_ANCHOR} className="scroll-mt-6">
    <Accordion type="single" collapsible value={expanded} onValueChange={setExpanded} className="rounded-lg border bg-card">
      <AccordionItem value="proyeccion" className="border-0">
        <AccordionTrigger className="min-h-11 px-4 py-3 text-sm font-semibold hover:no-underline">Proyección de caja</AccordionTrigger>
        <AccordionContent className="space-y-4 px-4 pb-4 pt-0">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Proyección de caja (proyecto)</h3>
            <p className="text-xs text-muted-foreground">Combina los movimientos confirmados hasta la fecha con los saldos abiertos actuales de CxC y CxP que vencen en esa fecha o antes. No reconstruye saldos históricos.</p>
          </div>
          <form method="get" action={`${pathname}#${PROJECTION_ANCHOR}`} className="space-y-3 rounded-lg border shell-surface-inset p-4">
            {Array.from(baseParams.entries()).map(([name, value], index) => <input key={`${name}-${index}`} type="hidden" name={name} value={value} />)}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="projection-date" className="text-xs text-muted-foreground">Fecha de proyección</Label>
                <Input id="projection-date" name="projectionDate" type="date" required min={compare ? context.today : undefined} max="9999-12-31" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} className="min-h-11 w-44" />
              </div>
              <Button type="submit" size="sm" className="min-h-11">Aplicar</Button>
              <Button asChild variant="ghost" size="sm" className="min-h-11"><a href={clearHref} onClick={clearDraft}>Limpiar</a></Button>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={compare} disabled={!inflowsAvailable} onChange={(event) => setCompare(event.target.checked)} className="h-5 w-5 shrink-0 accent-primary" />
              Comparar atraso de cobranza
            </label>
            {!inflowsAvailable ? <p className="text-xs text-muted-foreground">La comparación requiere acceso a Cuentas por cobrar.</p> : null}
            {compare && inflowsAvailable ? <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="projection-delay">Atraso hipotético (días corridos)</Label>
                <Input id="projection-delay" name="projectionCollectionDelayDays" type="number" min="0" max={context.maxCollectionDelayDays} step="1" required value={draftDelay} onChange={(event) => setDraftDelay(event.target.value)} className="min-h-11 w-44" />
              </div>
              <p className="text-xs text-muted-foreground">Para las vencidas, los días parten de hoy ({formatDate(context.today)}); para las futuras, de su vencimiento. Se aplica a todas las CxC abiertas de este alcance. Los pagos y movimientos confirmados se conservan.</p>
              <p className="text-xs text-muted-foreground">Usá una fecha de hoy o posterior. Límite técnico: {context.maxCollectionDelayDays.toLocaleString("es-AR")} días. Cero días reproduce la proyección base.</p>
            </div> : null}
            {active && dirty ? <p role="status" className="text-xs text-amber-800 dark:text-amber-300">Cambios sin aplicar. Los resultados corresponden a los filtros aplicados anteriormente.</p> : null}
          </form>

          {report?.scenarioError ? <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">{report.scenarioError} Se muestra solamente la proyección base.</p> : null}
          {!active ? <p className="text-sm text-muted-foreground">Elegí una fecha y presioná Aplicar para ver los indicadores.</p> : report ? <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Cálculo al {formatDate(context.today)} · Zona horaria: {context.timeZone}. Importes separados por moneda.</p>
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">{report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            {report.collectionDelayDays !== null ? <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">Escenario aplicado: {report.collectionDelayDays} {report.collectionDelayDays === 1 ? "día corrido" : "días corridos"} de atraso · fecha de proyección: {asOfLabel}. Es una comparación hipotética; no modifica vencimientos, documentos ni saldos reales.</p> : null}
            {report.currencies.map((row) => <section key={row.currency} aria-label={`Proyección en ${row.currency}`} className="space-y-4">
              <h4 className="text-sm font-medium">{row.currency}</h4>
              <KpiStatGrid title={null} columns={4}>
                <KpiStatCard label="Cobros recibidos hasta la fecha" value={inflowsAvailable ? formatMoneyAmount(row.collectionsReceived, row.currency) : "—"} tone="success" />
                <KpiStatCard label="Pagos realizados hasta la fecha" value={outflowsAvailable ? formatMoneyAmount(row.paymentsMade, row.currency) : "—"} tone="danger" />
                <KpiStatCard label="Cuentas por cobrar (vencimiento ≤ fecha)" value={inflowsAvailable ? formatMoneyAmount(row.receivablesDue, row.currency) : "—"} helper={inflowsAvailable ? `${row.receivableOpenCount} documento(s) abierto(s)` : undefined} />
                <KpiStatCard label="Cuentas por pagar (vencimiento ≤ fecha)" value={outflowsAvailable ? formatMoneyAmount(row.payablesDue, row.currency) : "—"} helper={outflowsAvailable ? `${row.payableOpenCount} documento(s) abierto(s)` : undefined} />
              </KpiStatGrid>
              <div data-testid={`projection-base-${row.currency}`}>
                <KpiStatCard label={`${partial ? "Capital proyectado visible" : "Capital proyectado"}${row.scenario ? " · base" : ""} a ${asOfLabel}`} value={formatMoneyAmount(row.projectedCapital, row.currency)} tone={moneyAmountTone(row.projectedCapital)} variant="highlight" helper={partial ? "Incluye las fuentes disponibles." : "Cobros recibidos − Pagos realizados + Cuentas por cobrar − Cuentas por pagar"} className="w-full" />
              </div>
              {row.scenario ? <section aria-label={`Comparación de cobranza en ${row.currency}`} className="space-y-3 rounded-lg border p-3 sm:p-4">
                <h5 className="text-sm font-semibold">{partial ? "Comparación parcial" : "Comparación de cobranza"}</h5>
                <KpiStatGrid title={null} columns={2}>
                  <div data-testid={`projection-scenario-${row.currency}`}><KpiStatCard label="Capital con atraso" value={formatMoneyAmount(row.scenario.projectedCapital, row.currency)} tone={moneyAmountTone(row.scenario.projectedCapital)} /></div>
                  <div data-testid={`projection-difference-${row.currency}`}><KpiStatCard label="Diferencia frente a la base" value={formatMoneyAmount(row.scenario.capitalDifference, row.currency)} tone={moneyAmountTone(row.scenario.capitalDifference)} /></div>
                  <KpiStatCard label="CxC dentro de la fecha con atraso" value={formatMoneyAmount(row.scenario.receivablesDue, row.currency)} />
                  <KpiStatCard label="CxC desplazadas después de la fecha" value={formatMoneyAmount(row.scenario.deferredReceivables, row.currency)} helper={`${row.scenario.deferredReceivableCount} documento(s)`} />
                </KpiStatGrid>
                {row.scenario.deferredReceivableCount === 0 ? <p className="text-xs text-muted-foreground">Con este atraso, ninguna cobranza de la base pasa después de la fecha elegida.</p> : null}
              </section> : null}
            </section>)}
            {report.collectionDelayDays !== null ? <p className="text-xs text-muted-foreground">Esta comparación se consulta en pantalla. La exportación de Flujo de caja corresponde a los movimientos reales.</p> : null}
            <div className="flex flex-wrap gap-2 pt-1">
              {inflowsAvailable ? <Button asChild variant="outline" size="sm" className="min-h-11"><a href={`/proyectos/${projectId}/cuentas-por-cobrar`}>Ver CxC</a></Button> : null}
              {outflowsAvailable ? <Button asChild variant="outline" size="sm" className="min-h-11"><a href={`/proyectos/${projectId}/cuentas-por-pagar`}>Ver CxP</a></Button> : null}
            </div>
          </div> : null}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </div>;
}
