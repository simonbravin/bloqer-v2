import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  JournalEntryDetailActions,
  JournalEntrySourcePanel,
  JournalEntryStatusBadge,
} from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import {
  getJournalEntryById,
  getJournalEntrySourceLink,
  type JournalEntryView,
} from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";
import { formatDate } from "@/lib/format";
import { PageBackLink } from "@/components/layout/page-back-link";
import { PageShell } from "@/components/layout/page-shell";
import { DetailField, DetailFieldGrid } from "@/components/ui/detail-field-grid";

export default async function AsientoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ journalEntryId: string }>;
  searchParams: Promise<EmpresaSearch>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const { journalEntryId } = await params;
  const sp = await searchParams;
  const ctx = (await buildTenantServiceContext())!;
  const cf = companyQueryFilter(sp);

  let entry: JournalEntryView;
  try {
    entry = await getJournalEntryById(journalEntryId, ctx, { companyId: cf.companyId ?? null });
  } catch {
    notFound();
  }

  const sourceLink =
    entry.sourceId && entry.sourceType !== "MANUAL"
      ? await getJournalEntrySourceLink(ctx, {
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          companyId: entry.companyId,
        })
      : null;

  const q = cf.companyId ? `?empresa=${encodeURIComponent(cf.companyId)}` : "";
  const canEdit = can(current.tenantCtx.roles, "EDIT", "ACCOUNTING");

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <PageBackLink href={`/contabilidad/asientos${q}`} label="Asientos" />
          <h1 className="text-2xl font-bold tracking-tight">Asiento</h1>
          <JournalEntryStatusBadge status={entry.status} />
        </div>
        {canEdit && entry.status === "DRAFT" && (
          <Button variant="outline" asChild>
            <Link href={`/contabilidad/asientos/${journalEntryId}/editar${q}`}>
              Editar borrador
            </Link>
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-card p-6 text-sm">
        <DetailFieldGrid>
          <DetailField label="Fecha">
            <span className="font-mono">{formatDate(entry.entryDate)}</span>
          </DetailField>
          <DetailField label="Origen">{entry.sourceType}</DetailField>
          <DetailField label="Descripción" fullWidth>
            {entry.description}
          </DetailField>
          {entry.reference ? (
            <DetailField label="Referencia" fullWidth>
              {entry.reference}
            </DetailField>
          ) : null}
        </DetailFieldGrid>
      </div>

      {sourceLink && <JournalEntrySourcePanel link={sourceLink} />}

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Líneas</h2>
        </div>
        <div className="p-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead className="text-right">Debe</TableHead>
                <TableHead className="text-right">Haber</TableHead>
                <TableHead>Moneda</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entry.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-sm">
                    {l.accountCode} — {l.accountName}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                    {l.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {l.debit !== "0" ? l.debit : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {l.credit !== "0" ? l.credit : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{l.currency}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {canEdit && entry.status === "DRAFT" && (
        <div className="rounded-lg border bg-card p-6 space-y-3">
          <h2 className="font-semibold">Acciones</h2>
          <JournalEntryDetailActions entryId={entry.id} status={entry.status} />
        </div>
      )}
    </PageShell>
  );
}
