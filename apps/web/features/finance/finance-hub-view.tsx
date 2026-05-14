import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox, Landmark, Scale } from "lucide-react";
import type {
  CompanyFinanceOperationsSummary,
  FinanceHubCurrencySnapshot,
  FinanceHubInsightBlock,
  FinanceHubOverview,
} from "@bloqer/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function formatMoney(raw: string, currency: string): string {
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  try {
    return new Intl.NumberFormat("es-AR", {
      style:                 "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${raw} ${currency}`;
  }
}

/** Stacked bar: al día / próximo (muted + primary) vs vencido (destructive). */
function DueStatusBar({ overdueShare }: { overdueShare: number | null }) {
  if (overdueShare == null) return null;
  const overduePct = Math.min(100, Math.max(0, Math.round(overdueShare * 100)));
  const currentPct = 100 - overduePct;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full border border-border/60 bg-muted">
        <div
          className="h-full bg-primary/85 transition-[width] duration-300"
          style={{ width: `${currentPct}%` }}
        />
        <div
          className="h-full bg-destructive transition-[width] duration-300"
          style={{ width: `${overduePct}%` }}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          Al día / próximo: <span className="font-medium text-foreground">{currentPct}%</span>
        </span>
        <span>
          Vencido: <span className="font-medium text-destructive">{overduePct}%</span> del saldo abierto
        </span>
      </div>
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="space-y-1 border-b border-border/70 pb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
      <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h2>
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
    </header>
  );
}

function EmptyStateCard({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/15 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <div className="text-sm text-muted-foreground">{body}</div>
      </div>
    </div>
  );
}

function InsightPlaceholder({
  title,
  description,
  block,
}: {
  title: string;
  description: string;
  block: FinanceHubInsightBlock;
}) {
  if (!block.visible) {
    return (
      <Card className="border-dashed border-muted-foreground/25 bg-muted/5 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyStateCard
            icon={Inbox}
            title="Sección no disponible"
            body={
              block.moduleEnabled && !block.hasPermission ? (
                <p>No tenés permiso para ver esta sección.</p>
              ) : (
                <p>El módulo está deshabilitado para este tenant.</p>
              )
            }
          />
        </CardContent>
      </Card>
    );
  }
  return null;
}

function CurrencySnapshotCard({ snap }: { snap: FinanceHubCurrencySnapshot }) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-border/80 bg-card p-5 shadow-sm",
        "ring-1 ring-border/40 transition-shadow hover:shadow-md hover:ring-border/60",
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <Badge variant="secondary" className="font-mono text-xs font-semibold">
          {snap.currency}
        </Badge>
        <span className="text-right text-xs leading-snug text-muted-foreground">
          {snap.openLineCount} ítem{snap.openLineCount === 1 ? "" : "s"} con saldo
        </span>
      </div>
      <dl className="flex-1 space-y-2.5 text-sm">
        <div className="flex justify-between gap-3 border-b border-border/50 pb-2">
          <dt className="text-muted-foreground">Saldo abierto</dt>
          <dd className="text-right text-base font-semibold tabular-nums tracking-tight text-foreground">
            {formatMoney(snap.openTotal, snap.currency)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Vencido</dt>
          <dd className="tabular-nums font-medium text-destructive">{formatMoney(snap.overdueTotal, snap.currency)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Al día / próximo</dt>
          <dd className="tabular-nums text-muted-foreground">{formatMoney(snap.currentOrNotDueTotal, snap.currency)}</dd>
        </div>
      </dl>
      <div className="mt-5 border-t border-border/60 pt-4">
        <DueStatusBar overdueShare={snap.overdueShareOfOpen} />
      </div>
      {snap.overdueLineCount > 0 ? (
        <p className="mt-3 text-xs text-destructive">
          {snap.overdueLineCount} línea{snap.overdueLineCount === 1 ? "" : "s"} vencida{snap.overdueLineCount === 1 ? "" : "s"} con saldo.
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Sin líneas vencidas con saldo pendiente.</p>
      )}
    </div>
  );
}

function InsightSection({
  title,
  description,
  block,
  footerExtra,
}: {
  title: string;
  description: string;
  block: FinanceHubInsightBlock | undefined;
  footerExtra?: ReactNode;
}) {
  if (!block) return null;
  const placeholder = <InsightPlaceholder title={title} description={description} block={block} />;
  if (!block.visible) return placeholder;

  return (
    <Card className="shadow-md ring-1 ring-border/50">
      <CardHeader className="space-y-1.5 pb-2">
        <CardTitle className="text-lg sm:text-xl">{title}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {block.loadFailed ? (
          <EmptyStateCard
            icon={Inbox}
            title="No se pudo cargar el resumen"
            body={<p>Probá el reporte de aging o verificá permisos con tu administrador.</p>}
          />
        ) : block.byCurrency.length === 0 ? (
          <EmptyStateCard
            icon={Inbox}
            title="Todo al día en este alcance"
            body={<p>No hay saldos abiertos en el aging para esta vista.</p>}
          />
        ) : (
          <>
            {block.multicurrency ? (
              <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Multimoneda: los importes se muestran por moneda. No consolidamos montos entre monedas distintas.
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {block.byCurrency.map((c) => (
                <CurrencySnapshotCard key={c.currency} snap={c} />
              ))}
            </div>
          </>
        )}
        {footerExtra}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t bg-muted/20 px-6 py-4">
        <Button asChild variant="default" size="sm">
          <Link href={block.agingHref}>Abrir aging</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function TreasuryHubCard({ card }: { card: NonNullable<FinanceHubOverview["treasuryCard"]> }) {
  if (!card.visible) {
    return (
      <Card className="border-dashed border-muted-foreground/25 bg-muted/5 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Tesorería</CardTitle>
          <CardDescription>Caja y bancos</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyStateCard
            icon={Landmark}
            title="Tesorería no disponible"
            body={
              card.moduleEnabled && !card.hasPermission ? (
                <p>No tenés permiso para ver tesorería.</p>
              ) : (
                <p>El módulo está deshabilitado para este tenant.</p>
              )
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md ring-1 ring-border/50">
      <CardHeader>
        <CardTitle className="text-lg sm:text-xl">Tesorería</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          Posición consolidada en cuentas activas (misma fuente que el resumen de tesorería). Sin saldos por proyecto
          inventados acá.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {card.loadFailed ? (
          <EmptyStateCard
            icon={Landmark}
            title="No se pudo cargar el resumen"
            body={<p>Probá desde Tesorería o los reportes de posición de caja.</p>}
          />
        ) : (
          <>
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">{card.displayHeadline}</p>
            {card.multicurrency && Object.keys(card.balancesByCurrency).length > 0 ? (
              <ul className="space-y-2">
                {Object.entries(card.balancesByCurrency).map(([cur, raw]) => (
                  <li
                    key={cur}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/25 px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs font-medium text-muted-foreground">{cur}</span>
                    <span className="tabular-nums text-base font-semibold text-foreground">{formatMoney(raw, cur)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t bg-muted/20 px-6 py-4">
        <Button asChild variant="default" size="sm">
          <Link href={card.treasuryHref}>Ir a tesorería</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={card.posicionCajaHref}>Posición de caja</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={card.movimientosHref}>Movimientos</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href={card.reportsHref}>Reportes</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function AccountingCard({ section }: { section: NonNullable<FinanceHubOverview["accountingSection"]> }) {
  if (!section.visible) {
    return (
      <Card className="border-dashed border-muted-foreground/25 bg-muted/5 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Contabilidad</CardTitle>
          <CardDescription>Libro mayor y asientos</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyStateCard
            icon={Scale}
            title="Contabilidad no disponible"
            body={
              section.moduleEnabled && !section.hasPermission ? (
                <p>No tenés permiso para ver contabilidad.</p>
              ) : (
                <p>El módulo está deshabilitado para este tenant.</p>
              )
            }
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="shadow-md ring-1 ring-border/50">
      <CardHeader>
        <CardTitle className="text-lg sm:text-xl">Contabilidad</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          Enlace al módulo de libro mayor. Este hub no agrega cálculos contables nuevos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Revisá cuentas, asientos en borrador o publicados, y reglas de mapeo desde el módulo principal.
        </p>
      </CardContent>
      <CardFooter className="border-t bg-muted/20 px-6 py-4">
        <Button asChild size="sm">
          <Link href={section.href}>Abrir contabilidad</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function CompanyOperationsHubCard({ summary }: { summary: CompanyFinanceOperationsSummary }) {
  if (!summary.visible) return null;
  return (
    <Card className="overflow-hidden border-border/80 shadow-md ring-1 ring-border/40">
      <CardHeader className="border-b border-border/60 bg-muted/20 pb-4">
        <CardTitle className="text-lg">Gastos generales (empresa)</CardTitle>
        <CardDescription>
          Resumen operativo de facturas y C×P <strong>sin proyecto</strong>. Los importes se muestran por moneda; no se
          suman monedas distintas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        {summary.loadFailed ? (
          <p className="text-sm text-destructive">No se pudo cargar el resumen. Reintentá más tarde.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Facturas en borrador</p>
                <p className="text-2xl font-semibold tabular-nums">{summary.draftInvoiceCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">C×P abiertas (líneas)</p>
                <p className="text-2xl font-semibold tabular-nums">{summary.openPayableCount}</p>
              </div>
            </div>
            {summary.openPayableBalancesByCurrency.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saldo abierto por moneda</p>
                <ul className="space-y-1.5 text-sm">
                  {summary.openPayableBalancesByCurrency.map((row) => (
                    <li key={row.currency} className="flex flex-wrap justify-between gap-2 border-b border-border/50 py-1.5 last:border-0">
                      <span className="text-muted-foreground">
                        {row.currency} · {row.openLineCount} obligacione{row.openLineCount !== 1 ? "s" : ""}
                      </span>
                      <span className="font-medium tabular-nums">{formatMoney(row.totalBalanceDue, row.currency)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No hay saldos abiertos en C×P corporativas.</p>
            )}
            {summary.recentCorporatePayments.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Últimos pagos corporativos</p>
                <ul className="divide-y divide-border/60 text-sm">
                  {summary.recentCorporatePayments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <Link
                          href={`/finanzas/pagos-proveedor/${p.id}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {p.supplierLabel}
                        </Link>
                        <p className="text-xs text-muted-foreground">{p.paymentDate}</p>
                      </div>
                      <span className="tabular-nums font-medium">{formatMoney(p.amount, p.currency)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t bg-muted/15 px-6 py-4">
        <Button asChild size="sm" variant="default">
          <Link href="/finanzas/gastos-generales">Abrir asistente</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/finanzas/gastos-generales/nueva">Nueva factura</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/finanzas/cuentas-por-pagar">Pagos pendientes</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={summary.movimientosCorporateFilterHref}>Movimientos tesorería</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export function FinanceHubView({ overview }: { overview: FinanceHubOverview }) {
  if (!overview.hasFinanceModules) {
    return (
      <EmptyStateCard
        icon={Inbox}
        title="Finanzas no habilitadas"
        body={
          <p>
            Los módulos de cuentas por cobrar, cuentas por pagar, tesorería o contabilidad no están activos para este
            tenant.
          </p>
        }
      />
    );
  }

  if (!overview.canSeeAnything) {
    return (
      <EmptyStateCard
        icon={Inbox}
        title="Sin acceso al tablero"
        body={
          <p>
            Necesitás al menos uno de: <span className="font-medium text-foreground">VIEW AR</span>,{" "}
            <span className="font-medium text-foreground">VIEW AP</span>,{" "}
            <span className="font-medium text-foreground">VIEW TREASURY</span> o{" "}
            <span className="font-medium text-foreground">VIEW ACCOUNTING</span>, con el módulo correspondiente
            habilitado.
          </p>
        }
      />
    );
  }

  return (
    <div className="space-y-12">
      {overview.alerts.length > 0 ? (
        <div className="space-y-2">
          {overview.alerts.map((a, i) => (
            <div
              key={i}
              role="note"
              className={
                a.variant === "warning"
                  ? "rounded-xl border border-destructive/35 bg-destructive/5 px-4 py-3 text-sm text-foreground shadow-sm"
                  : "rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
              }
            >
              {a.message}
            </div>
          ))}
        </div>
      ) : null}

      {overview.quickActions.length > 0 ? (
        <Card className="overflow-hidden border-primary/20 shadow-md ring-1 ring-primary/15">
          <CardHeader className="border-b border-border/60 bg-muted/25 pb-4">
            <CardTitle className="text-lg">Accesos rápidos</CardTitle>
            <CardDescription>Alta y reportes según tus permisos; un clic para lo operativo del día a día.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {overview.quickActions.map((a) => (
                <Button key={`${a.href}-${a.label}`} asChild variant="secondary" size="default" className="h-auto min-h-11 justify-center px-4 py-2 text-center font-medium shadow-sm">
                  <Link href={a.href}>{a.label}</Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {overview.companyOperations ? <CompanyOperationsHubCard summary={overview.companyOperations} /> : null}

      <section className="space-y-6 scroll-mt-8">
        <SectionIntro
          eyebrow="Cobranzas"
          title="Cuentas por cobrar"
          description="Cartera global consolidada por moneda a partir del aging de cuentas por cobrar."
        />
        {overview.arInsight ? (
          <InsightSection
            title="Resumen de cartera"
            description="Saldo abierto, importes vencidos vs al día o próximos, y cantidad de ítems con saldo."
            block={overview.arInsight}
          />
        ) : (
          <Card className="border-dashed shadow-none">
            <CardContent className="pt-8">
              <EmptyStateCard icon={Inbox} title="Módulo AR desactivado" body={<p>El tenant no tiene AR habilitado.</p>} />
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-6 scroll-mt-8">
        <SectionIntro
          eyebrow="Proveedores"
          title="Cuentas por pagar"
          description="Vista empresa del aging AP: total, obligaciones imputadas a obra y gastos generales de empresa (sin proyecto), siempre por moneda."
        />
        {overview.apGlobalInsight ? (
          <InsightSection
            title="Consolidado"
            description="Todas las obligaciones abiertas del tenant según el mismo aging global de cuentas por pagar."
            block={overview.apGlobalInsight}
          />
        ) : null}
        <div className="grid gap-6 lg:grid-cols-2">
          {overview.apWithProjectInsight ? (
            <InsightSection
              title="Por proyecto"
              description="Líneas del aging con obra asignada: compras y servicios imputados a un proyecto."
              block={overview.apWithProjectInsight}
            />
          ) : null}
          {overview.apCorporateInsight ? (
            <InsightSection
              title="Empresa / gastos generales"
              description="Obligaciones sin proyecto: alquileres, honorarios u otros gastos de estructura. Alineado a facturas y pagos pendientes de empresa."
              block={overview.apCorporateInsight}
              footerExtra={
                overview.apCorporateInsight.visible && !overview.apCorporateInsight.loadFailed ? (
                  <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                    <Button asChild variant="outline" size="sm">
                      <Link href="/finanzas/facturas-proveedor">Facturas y gastos</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/finanzas/facturas-proveedor/nueva">Nueva factura</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/finanzas/cuentas-por-pagar">Pagos pendientes</Link>
                    </Button>
                  </div>
                ) : null
              }
            />
          ) : null}
        </div>
      </section>

      {overview.treasuryCard ? (
        <section className="space-y-6 scroll-mt-8">
          <SectionIntro
            eyebrow="Liquidez"
            title="Tesorería"
            description="Saldo en cuentas de tesorería activas, desglosado por moneda cuando corresponde."
          />
          <TreasuryHubCard card={overview.treasuryCard} />
        </section>
      ) : null}

      {overview.accountingSection ? (
        <section className="space-y-6 scroll-mt-8">
          <SectionIntro
            eyebrow="Libro"
            title="Contabilidad"
            description="Atajo al módulo de contabilidad para revisar el mayor sin salir del contexto financiero."
          />
          <AccountingCard section={overview.accountingSection} />
        </section>
      ) : null}

      <section className="scroll-mt-8 space-y-4">
        <SectionIntro
          eyebrow="Detalle"
          title="Reportes y enlaces"
          description="Listados y reportes con el mismo criterio de permisos que el resto de la aplicación."
        />
        {overview.reportLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay enlaces adicionales con tus permisos actuales.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {overview.reportLinks.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className={cn(
                  "group rounded-xl border border-border/80 bg-card p-5 shadow-sm ring-1 ring-border/40",
                  "transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-md hover:ring-border",
                )}
              >
                <p className="font-semibold text-foreground group-hover:underline group-hover:underline-offset-4">{r.label}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.description}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
