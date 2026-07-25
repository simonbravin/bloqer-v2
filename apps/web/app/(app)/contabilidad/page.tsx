import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import {
  defaultAccountingMonthRange,
  getCompanies,
  getIncomeStatement,
  getStatementOfFinancialPosition,
  listJournalEntries,
} from "@bloqer/services";
import { can } from "@bloqer/domain";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { AccountingGerencialDisclaimer } from "@/features/accounting/components/accounting-gerencial-disclaimer";
import { formatDate } from "@/lib/format";

export default async function ContabilidadPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const ctx = await buildTenantServiceContext();
  const companies = ctx ? await getCompanies(ctx) : [];
  const month = defaultAccountingMonthRange();

  const emptyList = { data: [] as Awaited<ReturnType<typeof listJournalEntries>>["data"], total: 0 };
  let drafts = emptyList;
  let postedMonth = emptyList;
  let income: Awaited<ReturnType<typeof getIncomeStatement>> | null = null;
  let esp: Awaited<ReturnType<typeof getStatementOfFinancialPosition>> | null = null;

  if (ctx) {
    [drafts, postedMonth] = await Promise.all([
      listJournalEntries(ctx, { status: "DRAFT", page: 1, pageSize: 5 }),
      listJournalEntries(ctx, {
        status: "POSTED",
        fromDate: month.dateFrom,
        toDate: month.dateTo,
        page: 1,
        pageSize: 1,
      }),
    ]);
    // Soft KPIs: hub must still render if a report fails.
    const [incomeRes, espRes] = await Promise.allSettled([
      getIncomeStatement(ctx, { dateFrom: month.dateFrom, dateTo: month.dateTo }),
      getStatementOfFinancialPosition(ctx, {}),
    ]);
    income = incomeRes.status === "fulfilled" ? incomeRes.value : null;
    esp = espRes.status === "fulfilled" ? espRes.value : null;
  }

  const primaryCurrency =
    income?.currencies[0] ?? esp?.currencies[0] ?? "ARS";
  const monthResult = income?.byCurrency[primaryCurrency]?.netResult ?? "—";
  const assetsToday = esp?.byCurrency[primaryCurrency]?.totalAssets ?? "—";
  const monthResultTone =
    monthResult !== "—" && monthResult.trimStart().startsWith("-") ? "danger" : "default";

  const base = "/contabilidad";
  const q = (id: string) => (current.tenantCtx!.companyId ? "" : `?empresa=${encodeURIComponent(id)}`);

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contabilidad</h1>
          <p className="text-sm text-muted-foreground mt-1">Libro interno gerencial por empresa</p>
        </div>
        {can(current.tenantCtx.roles, "EDIT", "ACCOUNTING") ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`${base}/cuentas/nueva`}>Nueva cuenta</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`${base}/asientos/nuevo`}>Nuevo asiento</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`${base}/reglas/nueva`}>Nueva regla</Link>
            </Button>
          </div>
        ) : null}
      </div>

      <AccountingGerencialDisclaimer />

      <KpiStatGrid title="Indicadores" columns={4}>
        <KpiStatCard
          label="Borradores"
          value={String(drafts.total)}
          href={`${base}/asientos?status=DRAFT`}
          iconKey="gl_drafts"
          tone={drafts.total > 0 ? "warning" : "muted"}
          helper="Asientos pendientes de postear"
        />
        <KpiStatCard
          label="Contabilizados del mes"
          value={String(postedMonth.total)}
          href={`${base}/libro-diario?dateFrom=${month.dateFrom}&dateTo=${month.dateTo}`}
          iconKey="gl_posted_month"
          helper="Asientos POSTED del mes en curso"
        />
        <KpiStatCard
          label="Resultado del mes"
          value={monthResult}
          subtitle={primaryCurrency}
          href={`${base}/estado-resultados?dateFrom=${month.dateFrom}&dateTo=${month.dateTo}`}
          iconKey="gl_month_result"
          tone={monthResultTone}
          helper="Estado de resultados del mes"
        />
        <KpiStatCard
          label="Activo a hoy"
          value={assetsToday}
          subtitle={primaryCurrency}
          href={`${base}/situacion-patrimonial`}
          iconKey="gl_assets"
          helper="Situación patrimonial"
        />
      </KpiStatGrid>

      <Card className="rounded-xl border bg-card shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Borradores pendientes</CardTitle>
        </CardHeader>
        <CardContent>
          {drafts.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay asientos en borrador.</p>
          ) : (
            <ul className="divide-y">
              {drafts.data.map((e) => (
                <li key={e.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link
                    href={`${base}/asientos/${e.id}`}
                    className="group flex items-baseline justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground group-hover:underline">
                        {e.reference ?? e.description.slice(0, 60)}
                      </p>
                      {e.reference ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {e.description.slice(0, 80)}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatDate(e.entryDate)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
        <CardFooter>
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/asientos?status=DRAFT`}>Ver todos ({drafts.total})</Link>
          </Button>
        </CardFooter>
      </Card>

      {!current.tenantCtx.companyId && companies.length > 1 ? (
        <div className="rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">Varias empresas</p>
          <p className="mt-1 text-muted-foreground">Elegí empresa para enlaces con contexto:</p>
          <ul className="mt-2 space-y-1">
            {companies.map((c) => (
              <li key={c.id}>
                <span className="text-muted-foreground">{c.name}:</span>{" "}
                <Link
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  href={`${base}/cuentas${q(c.id)}`}
                >
                  Cuentas
                </Link>
                {" · "}
                <Link
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  href={`${base}/reglas${q(c.id)}`}
                >
                  Reglas
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </PageShell>
  );
}
