import type { ProjectOverviewBillingVsCollections } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function pct(invoiced: number, collected: number): number {
  if (invoiced <= 0) return 0;
  return Math.min(100, Math.round((collected / invoiced) * 100));
}

export function ProjectOverviewBillingBars({ data }: { data: ProjectOverviewBillingVsCollections }) {
  const currencies = new Set([
    ...data.invoicedByCurrency.map((r) => r.currency),
    ...data.collectedByCurrency.map((r) => r.currency),
  ]);
  const rows = [...currencies].sort();
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin facturas emitidas ni cobranzas confirmadas para comparar en este proyecto.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {rows.map((cur) => {
        const inv = Number(data.invoicedByCurrency.find((r) => r.currency === cur)?.amount ?? 0);
        const col = Number(data.collectedByCurrency.find((r) => r.currency === cur)?.amount ?? 0);
        const p = pct(inv, col);
        return (
          <div key={cur}>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>{cur}</span>
              <span>
                Cobrado {p}% del facturado (misma moneda)
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${p}%` }}
                title={`Facturado: ${inv} · Cobrado: ${col}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProjectOverviewBillingCard({ data }: { data: ProjectOverviewBillingVsCollections }) {
  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Facturado vs cobrado</CardTitle>
        <CardDescription>
          Facturas en estado emitido y cobranzas confirmadas, por moneda. Sin conversión de cambio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ProjectOverviewBillingBars data={data} />
      </CardContent>
    </Card>
  );
}
