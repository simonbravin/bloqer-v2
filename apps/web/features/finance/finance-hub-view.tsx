import Link from "next/link";
import type { FinanceHubOverview } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

function MoneyCard({
  title,
  description,
  card,
}: {
  title: string;
  description: string;
  card: NonNullable<FinanceHubOverview["arCard"]>;
}) {
  if (!card.visible) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {card.moduleEnabled && !card.hasPermission
              ? "No tenés permiso para ver esta sección."
              : "Módulo deshabilitado para el tenant."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {card.loadFailed ? (
          <p className="text-sm text-muted-foreground">No se pudo cargar el resumen. Probá el reporte detallado.</p>
        ) : (
          <>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{card.displayTotal}</p>
            {card.multicurrency ? (
              <p className="text-xs text-muted-foreground">Varias monedas: usá el aging para el detalle.</p>
            ) : null}
            {card.overdueLineCount > 0 ? (
              <p className="text-xs text-destructive">Líneas vencidas con saldo: {card.overdueLineCount}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Sin líneas vencidas con saldo pendiente.</p>
            )}
          </>
        )}
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" size="sm">
          <Link href={card.agingHref}>Ver aging</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function TreasuryHubCard({ card }: { card: NonNullable<FinanceHubOverview["treasuryCard"]> }) {
  if (!card.visible) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Tesorería</CardTitle>
          <CardDescription>Caja y bancos</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {card.moduleEnabled && !card.hasPermission ? "No tenés permiso para ver tesorería." : "Módulo deshabilitado."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tesorería</CardTitle>
        <CardDescription>Saldo en cuentas activas (misma lógica que el resumen de tesorería).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {card.loadFailed ? (
          <p className="text-sm text-muted-foreground">No se pudo cargar el resumen.</p>
        ) : (
          <>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{card.displayHeadline}</p>
            {card.multicurrency && Object.keys(card.balancesByCurrency).length > 0 ? (
              <ul className="text-sm text-muted-foreground">
                {Object.entries(card.balancesByCurrency).map(([cur, raw]) => (
                  <li key={cur} className="flex justify-between gap-2">
                    <span>{cur}</span>
                    <span className="tabular-nums font-medium text-foreground">{raw}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={card.treasuryHref}>Tesorería</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={card.reportsHref}>Reportes</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export function FinanceHubView({ overview }: { overview: FinanceHubOverview }) {
  if (!overview.hasFinanceModules) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
        Los módulos de finanzas (cuentas por cobrar, por pagar o tesorería) no están habilitados para este tenant.
      </div>
    );
  }

  if (!overview.canSeeAnything) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
        No tenés permisos para ver resúmenes de finanzas. Pedí acceso a AR, AP o tesorería según corresponda.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {overview.arCard ? (
          <MoneyCard title="Cuentas por cobrar" description="Saldo abierto (aging consolidado)" card={overview.arCard} />
        ) : null}
        {overview.apCard ? (
          <MoneyCard title="Cuentas por pagar" description="Saldo abierto (aging consolidado)" card={overview.apCard} />
        ) : null}
        {overview.treasuryCard ? <TreasuryHubCard card={overview.treasuryCard} /> : null}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Reportes y detalle</h2>
        {overview.reportLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay reportes disponibles con tus permisos actuales.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {overview.reportLinks.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
              >
                <p className="font-medium">{r.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
