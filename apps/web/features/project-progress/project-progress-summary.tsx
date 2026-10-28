import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  FileCheck2,
  HardHat,
  Wallet,
} from "lucide-react";
import type { ProjectProgressReport } from "@bloqer/services";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { formatMoneyDisplay, formatRatePctWithSymbol } from "@/lib/format-money";

export function ProjectProgressSummary({ report }: { report: ProjectProgressReport }) {
  const base = `/proyectos/${report.projectId}`;
  const physicalIncomplete = report.physical.pct === null;
  const executed = report.physical.pct ?? report.physical.observedPct;
  const cards = [
    {
      title: physicalIncomplete ? "Ejecutado observado" : "Ejecutado · libro aprobado",
      icon: HardHat,
      value: formatRatePctWithSymbol(executed),
      pct: executed,
      detail: `Cobertura ${formatRatePctWithSymbol(report.physical.coveragePct)} · ${report.physical.coveredCount} de ${report.physical.totalCount} partidas`,
      note: physicalIncomplete
        ? "Contribución conocida; el avance total todavía no está disponible."
        : "Mediciones aprobadas, ponderadas por costo presupuestado.",
      href: `${base}/libro-obra`,
      color: "bg-indigo-500",
      accent: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
      sourceDate: report.sourceDates.jobsite,
      sourceDateLabel: "Última medición",
    },
    {
      title: "Certificado",
      icon: FileCheck2,
      value: formatRatePctWithSymbol(report.financial.certifiedPct),
      pct: report.financial.certifiedPct,
      detail: formatMoneyDisplay(report.financial.certified, report.currency),
      note: `Sobre venta presupuestada: ${formatMoneyDisplay(report.financial.budgetSale, report.currency)}.`,
      href: `${base}/certificaciones`,
      color: "bg-sky-500",
      accent: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
      sourceDate: report.sourceDates.certifications,
      sourceDateLabel: "Último certificado",
    },
    {
      title: "Costo devengado",
      icon: CircleDollarSign,
      value: formatRatePctWithSymbol(report.financial.costAccruedPct),
      pct: report.financial.costAccruedPct,
      detail: formatMoneyDisplay(report.financial.costAccrued, report.currency),
      note: `Sobre costo presupuestado: ${formatMoneyDisplay(report.financial.budgetCost, report.currency)}.`,
      href: `${base}/control-costos`,
      color: "bg-amber-500",
      accent: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      sourceDate: report.sourceDates.costs,
      sourceDateLabel: "Último registro de costo",
    },
    {
      title: "Cobrado sobre facturado",
      icon: Wallet,
      value: formatRatePctWithSymbol(report.financial.collectionPct),
      pct: report.financial.collectionPct,
      detail: formatMoneyDisplay(report.financial.collected, report.currency),
      note: `Sobre facturación emitida: ${formatMoneyDisplay(report.financial.invoiced, report.currency)}.`,
      href: `${base}/cuentas-por-cobrar`,
      color: "bg-emerald-500",
      accent: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      sourceDate: report.sourceDates.collections,
      sourceDateLabel: "Última cobranza",
    },
  ];

  return (
    <section className="space-y-4" aria-label="Indicadores de avance al corte">
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {cards.map(({ icon: Icon, ...card }) => (
          <Card key={card.title} className="min-w-0 overflow-hidden rounded-xl shadow-sm">
            <CardContent className="p-5">
              <div className="mb-5 flex items-start justify-between gap-2">
                <h2 className="text-sm font-medium leading-snug text-muted-foreground">
                  {card.title}
                </h2>
                <span className={`rounded-lg p-2 ${card.accent}`}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
              </div>
              <div className="text-3xl font-semibold tracking-tight tabular-nums">{card.value}</div>
              <p className="mt-2 min-h-5 text-sm font-medium tabular-nums">{card.detail}</p>
              <div className="my-4 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                {card.pct !== null ? (
                  <div
                    className={`h-full rounded-full ${card.color}`}
                    style={{ width: `${Math.max(0, Math.min(100, Number(card.pct)))}%` }}
                  />
                ) : null}
              </div>
              <p className="min-h-10 text-xs leading-relaxed text-muted-foreground">{card.note}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {card.sourceDate
                  ? `${card.sourceDateLabel}: ${formatDate(`${card.sourceDate}T12:00:00.000Z`)}`
                  : "Sin evidencia al corte"}
              </p>
              {card.pct !== null ? (
                <Link
                  href={card.href}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Ver origen <ArrowUpRight className="h-3 w-3" aria-hidden />
                </Link>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  Sin base completa o sin acceso a la fuente.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-xs text-muted-foreground">Planificado al corte</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatRatePctWithSymbol(report.plan.pct)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cobertura {formatRatePctWithSymbol(report.plan.coveragePct)}
            </p>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Real · cronograma completo actual</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatRatePctWithSymbol(report.schedule.progressPct)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Puede incluir ajustes manuales; no se suma al libro.
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Tareas actuales · proyecto completo</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {report.schedule.totalTasks > 0
              ? `${report.schedule.delayedTasks} atrasadas · ${report.schedule.blockedTasks} bloqueadas`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {report.schedule.totalTasks > 0
              ? `${report.schedule.completedTasks} de ${report.schedule.totalTasks} completadas`
              : "Sin tareas disponibles en este alcance."}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Saldo por cobrar al corte</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatMoneyDisplay(report.financial.receivableBalance, report.currency)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Vencido: {formatMoneyDisplay(report.financial.overdueBalance, report.currency)}
          </p>
        </div>
      </div>
    </section>
  );
}
