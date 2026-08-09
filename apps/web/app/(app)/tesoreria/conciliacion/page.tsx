import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { canEditBankReconciliationUi } from "@/features/treasury/lib/treasury-edit-gates";
import {
  listBankReconciliations,
  listTreasuryAccounts,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { PageListHeader } from "@/components/ui/page-list-header";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { DataTableSection } from "@/components/ui/data-table-section";
import { ReportExportActions } from "@/features/reports";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { parsePage } from "@/lib/parse-page";
import { bankReconciliationStatusLabel } from "@/features/treasury/lib/bank-reconciliation-status-label";

const PAGE_SIZE = 20;

const STATUS_FILTERS = ["DRAFT", "IN_PROGRESS", "CLOSED", "CANCELLED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function isStatusFilter(v: string | undefined): v is StatusFilter {
  return !!v && (STATUS_FILTERS as readonly string[]).includes(v);
}

function badgeVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "CLOSED") return "default";
  if (status === "CANCELLED") return "outline";
  return "secondary";
}

function buildFilterHref(opts: {
  estado?: string | null;
  cuenta?: string | null;
}): string {
  const params = new URLSearchParams();
  if (opts.estado) params.set("estado", opts.estado);
  if (opts.cuenta) params.set("cuenta", opts.cuenta);
  const qs = params.toString();
  return qs ? `/tesoreria/conciliacion?${qs}` : "/tesoreria/conciliacion";
}

export default async function ConciliacionListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; estado?: string; cuenta?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  if (!can(ctx.roles, "VIEW", "BANK_RECONCILIATION")) {
    return (
      <PageShell variant="default" className="space-y-6">
        <PageListHeader
          title="Conciliación bancaria"
          subtitle="Emparejá líneas de extracto con movimientos del sistema."
        />
        <ListEmptyState
          title="Sin permisos para ver conciliación"
          description="Pedile a un administrador que te asigne el permiso de ver conciliación bancaria."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/tesoreria">Volver a tesorería</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  const sp = await searchParams;
  const page = parsePage(sp.page);
  const status = isStatusFilter(sp.estado) ? sp.estado : undefined;
  const cuentaRaw = sp.cuenta?.trim() || "";
  const accountId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cuentaRaw)
      ? cuentaRaw
      : undefined;
  const canEdit = canEditBankReconciliationUi(ctx.roles);

  let result;
  let accounts: Awaited<ReturnType<typeof listTreasuryAccounts>>["data"] = [];
  try {
    [result, { data: accounts }] = await Promise.all([
      listBankReconciliations(ctx, {
        page,
        pageSize: PAGE_SIZE,
        status,
        accountId,
      }),
      listTreasuryAccounts(ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") {
      return (
        <PageShell variant="default" className="space-y-6">
          <PageListHeader title="Conciliación bancaria" />
          <ListEmptyState
            title="Sin permisos para ver conciliación"
            description="No tenés acceso a este módulo con tu rol actual."
            action={
              <Button asChild size="sm" variant="outline">
                <Link href="/tesoreria">Volver a tesorería</Link>
              </Button>
            }
          />
        </PageShell>
      );
    }
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Conciliación bancaria"
        subtitle="Emparejá líneas de extracto con movimientos del sistema."
        actions={
          <>
            <ReportExportActions
              exportPath="/api/reports/tesoreria/conciliacion.csv"
              params={accountId ? { accountId } : {}}
            />
            {canEdit && (
              <Button asChild size="sm">
                <Link href="/tesoreria/conciliacion/nueva">Nueva conciliación</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant={!status ? "secondary" : "outline"}>
            <Link href={buildFilterHref({ estado: null, cuenta: accountId ?? null })}>
              Todos los estados
            </Link>
          </Button>
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s}
              asChild
              size="sm"
              variant={status === s ? "secondary" : "outline"}
            >
              <Link href={buildFilterHref({ estado: s, cuenta: accountId ?? null })}>
                {bankReconciliationStatusLabel(s)}
              </Link>
            </Button>
          ))}
        </div>
        {accounts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant={!accountId ? "secondary" : "outline"}>
              <Link href={buildFilterHref({ estado: status ?? null, cuenta: null })}>
                Todas las cuentas
              </Link>
            </Button>
            {accounts.map((a) => (
              <Button
                key={a.id}
                asChild
                size="sm"
                variant={accountId === a.id ? "secondary" : "outline"}
              >
                <Link href={buildFilterHref({ estado: status ?? null, cuenta: a.id })}>
                  {a.name}
                </Link>
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <DataTableSection
        title="Sesiones de conciliación"
        description="Historial completo (incluye canceladas). Filtrá por estado o cuenta."
      >
        {result.data.length === 0 ? (
          <ListEmptyState
            title="Todavía no hay sesiones de conciliación"
            description="Creá una sesión por cuenta y período para importar el extracto y emparejar movimientos."
            action={
              canEdit ? (
                <Button asChild size="sm">
                  <Link href="/tesoreria/conciliacion/nueva">Nueva conciliación</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Cierre</TableHead>
                  <TableHead className="text-right">Sin match</TableHead>
                  <TableHead className="text-right">Mov. sin conciliar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        href={`/tesoreria/conciliacion/${s.id}`}
                        className="font-medium hover:underline"
                      >
                        {s.accountName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(s.periodStart)} — {formatDate(s.periodEnd)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badgeVariant(s.status)}>
                        {bankReconciliationStatusLabel(s.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoneyAmount(s.closingBalance, s.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        className={
                          s.unmatchedLines > 0
                            ? "text-amber-700 dark:text-amber-300 font-medium"
                            : undefined
                        }
                      >
                        {s.unmatchedLines}/{s.lines.length}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.unreconciledMovementCount == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={
                            s.unreconciledMovementCount > 0
                              ? "text-amber-700 dark:text-amber-300 font-medium"
                              : undefined
                          }
                        >
                          {s.unreconciledMovementCount}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </DataTableSection>

      <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} />
    </PageShell>
  );
}
