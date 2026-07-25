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
import { AccountingGerencialDisclaimer } from "@/features/accounting/components/accounting-gerencial-disclaimer";

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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border p-4 text-sm space-y-1">
          <p className="text-muted-foreground">Borradores</p>
          <p className="text-2xl font-semibold tabular-nums">{drafts.total}</p>
          <Link
            href={`${base}/asientos?status=DRAFT`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Ver bandeja
          </Link>
        </div>
        <div className="rounded-md border p-4 text-sm space-y-1">
          <p className="text-muted-foreground">Contabilizados del mes</p>
          <p className="text-2xl font-semibold tabular-nums">{postedMonth.total}</p>
          <Link
            href={`${base}/libro-diario?dateFrom=${month.dateFrom}&dateTo=${month.dateTo}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Libro diario
          </Link>
        </div>
        <div className="rounded-md border p-4 text-sm space-y-1">
          <p className="text-muted-foreground">Resultado del mes ({primaryCurrency})</p>
          <p className="text-2xl font-semibold tabular-nums font-mono">{monthResult}</p>
          <Link
            href={`${base}/estado-resultados?dateFrom=${month.dateFrom}&dateTo=${month.dateTo}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Ver resultados
          </Link>
        </div>
        <div className="rounded-md border p-4 text-sm space-y-1">
          <p className="text-muted-foreground">Activo a hoy ({primaryCurrency})</p>
          <p className="text-2xl font-semibold tabular-nums font-mono">{assetsToday}</p>
          <Link
            href={`${base}/situacion-patrimonial`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Situación patrimonial
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link className="rounded-md border p-4 text-sm hover:bg-muted/40" href={`${base}/cuentas`}>
          Plan de cuentas
        </Link>
        <Link className="rounded-md border p-4 text-sm hover:bg-muted/40" href={`${base}/asientos`}>
          Asientos
        </Link>
        <Link className="rounded-md border p-4 text-sm hover:bg-muted/40" href={`${base}/reglas`}>
          Reglas contables
        </Link>
        <Link
          className="rounded-md border p-4 text-sm hover:bg-muted/40"
          href={`${base}/sumas-y-saldos`}
        >
          Sumas y saldos
        </Link>
      </div>

      <div className="rounded-md border p-4 text-sm space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">Borradores pendientes</p>
          <Link
            href={`${base}/asientos?status=DRAFT`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Ver todos ({drafts.total})
          </Link>
        </div>
        {drafts.data.length === 0 ? (
          <p className="text-muted-foreground">No hay asientos en borrador.</p>
        ) : (
          <ul className="space-y-1">
            {drafts.data.map((e) => (
              <li key={e.id}>
                <Link
                  href={`${base}/asientos/${e.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {e.reference ?? e.description.slice(0, 60)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!current.tenantCtx.companyId && companies.length > 1 && (
        <div className="rounded-md border bg-muted/30 p-4 text-sm">
          <p className="font-medium">Varias empresas</p>
          <p className="text-muted-foreground mt-1">Elegí empresa para enlaces con contexto:</p>
          <ul className="mt-2 space-y-1">
            {companies.map((c) => (
              <li key={c.id}>
                <span className="text-muted-foreground">{c.name}:</span>{" "}
                <Link className="text-primary underline-offset-4 hover:underline" href={`${base}/cuentas${q(c.id)}`}>
                  Cuentas
                </Link>
                {" · "}
                <Link className="text-primary underline-offset-4 hover:underline" href={`${base}/reglas${q(c.id)}`}>
                  Reglas
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageShell>
  );
}
