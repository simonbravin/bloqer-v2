import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getCompanies } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { PageShell } from "@/components/layout/page-shell";

export default async function ContabilidadPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const ctx = await buildTenantServiceContext();
  const companies = ctx ? await getCompanies(ctx) : [];

  const base = "/contabilidad";
  const q = (id: string) => (current.tenantCtx!.companyId ? "" : `?empresa=${encodeURIComponent(id)}`);

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Contabilidad</h1>
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
