import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { JournalEntryList } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { listJournalEntries } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";

export default async function AsientosPage({ searchParams }: { searchParams: Promise<EmpresaSearch> }) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const sp = await searchParams;
  const ctx = (await buildTenantServiceContext())!;
  const cf = companyQueryFilter(sp);
  const entries = await listJournalEntries(ctx, { companyId: cf.companyId ?? null });

  const empresa = cf.companyId;
  const q = empresa ? `?empresa=${encodeURIComponent(empresa)}` : "";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/contabilidad">← Volver</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Asientos</h1>
        </div>
        {can(current.tenantCtx.roles, "EDIT", "ACCOUNTING") && (
          <Button asChild><Link href={`/contabilidad/asientos/nuevo${q}`}>+ Nuevo asiento</Link></Button>
        )}
      </div>
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Diario (últimos 200)</h2>
        </div>
        <div className="p-6 overflow-x-auto">
          <JournalEntryList entries={entries} empresa={empresa} />
        </div>
      </div>
    </div>
  );
}
