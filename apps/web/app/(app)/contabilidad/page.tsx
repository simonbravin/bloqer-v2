import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { accountingPageCompany } from "@/lib/accounting-page-company";
import type { EmpresaSearch } from "@/lib/accounting-search-params";
import {
  defaultAccountingMonthRange,
  getIncomeStatement,
  getStatementOfFinancialPosition,
  listJournalEntries,
} from "@bloqer/services";
import { can } from "@bloqer/domain";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { AccountingGerencialDisclaimer } from "@/features/accounting/components/accounting-gerencial-disclaimer";
import { formatDate } from "@/lib/format";

export default async function ContabilidadPage({ searchParams }: { searchParams: Promise<EmpresaSearch> }) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const { ctx, companies, company } = await accountingPageCompany(await searchParams);
  if (!company) {
    return (
      <PageShell variant="default" className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Contabilidad</h1>
        <ListEmptyState
          title={companies.length ? "Elegí una empresa" : "No hay una empresa activa"}
          description={companies.length ? "Elegí una empresa arriba para consultar su libro contable." : "Configurá una empresa activa para consultar su libro contable."}
          action={companies.length === 1 ? <Button asChild><Link href="/contabilidad">Ver empresa activa</Link></Button> : undefined}
        />
      </PageShell>
    );
  }
  const companyId = company.id;
  const month = defaultAccountingMonthRange();

  const [drafts, postedMonth] = await Promise.all([
      listJournalEntries(ctx, { companyId, status: "DRAFT", page: 1, pageSize: 5 }),
      listJournalEntries(ctx, {
        companyId,
        status: "POSTED",
        fromDate: month.dateFrom,
        toDate: month.dateTo,
        page: 1,
        pageSize: 1,
      }),
  ]);
  const [incomeRes, espRes] = await Promise.allSettled([
    getIncomeStatement(ctx, { companyId, dateFrom: month.dateFrom, dateTo: month.dateTo }),
    getStatementOfFinancialPosition(ctx, { companyId }),
  ]);
  const income = incomeRes.status === "fulfilled" ? incomeRes.value : null;
  const esp = espRes.status === "fulfilled" ? espRes.value : null;

  const primaryCurrency =
    income?.currencies[0] ?? esp?.currencies[0] ?? "ARS";
  const monthResult = income?.byCurrency[primaryCurrency]?.netResult ?? "—";
  const assetsToday = esp?.byCurrency[primaryCurrency]?.totalAssets ?? "—";
  const monthResultTone =
    monthResult !== "—" && monthResult.trimStart().startsWith("-") ? "danger" : "default";

  const base = "/contabilidad";
  const href = (path: string, filters: Record<string, string> = {}) => {
    const query = new URLSearchParams({ ...filters, empresa: companyId });
    return `${base}${path}?${query.toString()}`;
  };

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contabilidad</h1>
          <p className="text-sm text-muted-foreground mt-1">Libro interno gerencial · {company.name}</p>
        </div>
        {can(current.tenantCtx.roles, "EDIT", "ACCOUNTING") ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={href("/cuentas/nueva")}>Nueva cuenta</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={href("/asientos/nuevo")}>Nuevo asiento</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={href("/reglas/nueva")}>Nueva regla</Link>
            </Button>
          </div>
        ) : null}
      </div>

      <AccountingGerencialDisclaimer />

      <KpiStatGrid title="Indicadores" columns={4}>
        <KpiStatCard
          label="Borradores"
          value={String(drafts.total)}
          href={href("/asientos", { status: "DRAFT" })}
          iconKey="gl_drafts"
          tone={drafts.total > 0 ? "warning" : "muted"}
          helper="Asientos pendientes de contabilizar"
        />
        <KpiStatCard
          label="Contabilizados del mes"
          value={String(postedMonth.total)}
          href={href("/libro-diario", month)}
          iconKey="gl_posted_month"
          helper="Asientos contabilizados del mes en curso"
        />
        <KpiStatCard
          label="Resultado del mes"
          value={monthResult}
          subtitle={primaryCurrency}
          href={href("/estado-resultados", month)}
          iconKey="gl_month_result"
          tone={monthResultTone}
          helper="Estado de resultados del mes"
        />
        <KpiStatCard
          label="Activo a hoy"
          value={assetsToday}
          subtitle={primaryCurrency}
          href={href("/situacion-patrimonial")}
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
                    href={href(`/asientos/${e.id}`)}
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
            <Link href={href("/asientos", { status: "DRAFT" })}>Ver todos ({drafts.total})</Link>
          </Button>
        </CardFooter>
      </Card>

    </PageShell>
  );
}
