import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { requireAccountingPageCompany } from "@/lib/accounting-page-company";
import { listPostedJournalBook, resolvePagination, ServiceError } from "@bloqer/services";
import { can } from "@bloqer/domain";
import type { EmpresaSearch } from "@/lib/accounting-search-params";
import { PageShell } from "@/components/layout/page-shell";
import { formatDbDate } from "@/lib/format";
import { journalEntrySourceLabel } from "@/features/accounting/lib/journal-entry-source-label";
import { DataTableSection } from "@/components/ui/data-table-section";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { Pagination } from "@/components/ui/pagination";
import { ReportExportActions } from "@/features/reports";
import { AccountingReportFilters } from "@/features/accounting/components/accounting-report-filters";
import { AccountingReportRangeError } from "@/features/accounting/components/accounting-report-range-error";
import { AccountingGerencialDisclaimer } from "@/features/accounting/components/accounting-gerencial-disclaimer";
import { formatMoneyAmount, isZeroMoneyAmount } from "@/lib/format-money";

const PAGE_SIZE = 50;

export default async function LibroDiarioPage({
  searchParams,
}: {
  searchParams: Promise<EmpresaSearch & { dateFrom?: string; dateTo?: string; page?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const sp = await searchParams;
  const { ctx, cf } = await requireAccountingPageCompany(sp);
  const { page } = resolvePagination({ page: Number(sp.page ?? 1), pageSize: PAGE_SIZE });
  let book;
  try {
    book = await listPostedJournalBook(ctx, {
      companyId: cf.companyId,
      dateFrom: sp.dateFrom,
      dateTo: sp.dateTo,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (error) {
    if (error instanceof ServiceError && error.code === "VALIDATION") {
      return <AccountingReportRangeError title="Libro diario" message={error.message} />;
    }
    throw error;
  }

  const exportParams: Record<string, string | undefined> = {
    dateFrom: book.dateFrom,
    dateTo: book.dateTo,
    empresa: cf.companyId,
  };
  const empresaQ = cf.companyId ? `?empresa=${encodeURIComponent(cf.companyId)}` : "";

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Libro diario</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Período {formatDbDate(book.dateFrom)} — {formatDbDate(book.dateTo)}. Solo asientos contabilizados.
          </p>
        </div>
        <ReportExportActions
          exportPath="/api/reports/contabilidad/libro-diario"
          params={exportParams}
          pdf
          xlsx
        />
      </div>

      <AccountingGerencialDisclaimer />

      <div className="rounded-lg border bg-card p-4">
        <Suspense fallback={null}>
          <AccountingReportFilters />
        </Suspense>
      </div>

      <p className="text-sm text-muted-foreground">
        {book.total} asiento{book.total === 1 ? "" : "s"} en el período.
      </p>

      <DataTableSection title="Asientos">
        {book.data.length === 0 ? (
          <ListEmptyState message="No hay asientos contabilizados en el período. Contabilizá borradores en Asientos." />
        ) : (
          <div className="space-y-4">
            {book.data.map((e) => (
              <div key={e.id} className="rounded-md border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono whitespace-nowrap">{formatDbDate(e.entryDate)}</span>
                    <Link
                      href={`/contabilidad/asientos/${e.id}${empresaQ}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {e.reference ?? e.id.slice(0, 8)}
                    </Link>
                    <span className="text-muted-foreground truncate max-w-[320px]" title={e.description}>
                      {e.description}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{journalEntrySourceLabel(e.sourceType)}</span>
                </div>
                <TableScroll>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cuenta</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right">Debe</TableHead>
                        <TableHead className="text-right">Haber</TableHead>
                        <TableHead>Moneda</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {e.lines.map((l, i) => {
                        const zeroDebit = isZeroMoneyAmount(l.debit);
                        const zeroCredit = isZeroMoneyAmount(l.credit);
                        return (
                        <TableRow key={`${e.id}-${i}`}>
                          <TableCell className="font-mono text-sm">
                            {l.accountCode}{" "}
                            <span className="font-sans text-muted-foreground">{l.accountName}</span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {l.description ?? "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {!zeroDebit ? formatMoneyAmount(l.debit) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {!zeroCredit ? formatMoneyAmount(l.credit) : "—"}
                          </TableCell>
                          <TableCell className="text-sm">{l.currency}</TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableScroll>
              </div>
            ))}
          </div>
        )}
      </DataTableSection>

      <Pagination page={page} pageSize={PAGE_SIZE} total={book.total} />
    </PageShell>
  );
}
