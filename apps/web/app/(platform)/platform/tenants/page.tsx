import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { listPlatformTenantsEnriched, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { getPlatformServiceContext } from "@/lib/platform-service-context";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlatformTenantAlerts } from "@/features/platform/platform-tenant-alerts";
import {
  extendPlatformTenantTrialAction,
  updatePlatformTenantStatusAction,
} from "@/app/(platform)/platform-actions";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function PlatformTenantsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ctx = await getPlatformServiceContext(session.user.id);
  const sp = await searchParams;
  const q = sp.q?.trim();
  let rows;
  try {
    rows = await listPlatformTenantsEnriched({ search: q, limit: 100 }, ctx);
  } catch (e) {
    if (e instanceof ServiceError && e.code === "FORBIDDEN") redirect("/dashboard");
    throw e;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organizaciones</h1>
          <p className="text-sm text-muted-foreground">Búsqueda por nombre o slug, alertas y acciones rápidas.</p>
        </div>
        <Button asChild>
          <Link href="/platform/tenants/new">Crear organización</Link>
        </Button>
      </div>
      <form className="flex max-w-md flex-wrap items-end gap-2" method="get" action="/platform/tenants">
        <div className="grid min-w-[200px] flex-1 gap-1">
          <label htmlFor="q" className="text-xs text-muted-foreground">
            Buscar
          </label>
          <Input id="q" name="q" defaultValue={q ?? ""} placeholder="Nombre o slug" />
        </div>
        <Button type="submit" size="sm">
          Filtrar
        </Button>
      </form>
      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Suscripción</TableHead>
              <TableHead>Trial hasta</TableHead>
              <TableHead>Alertas</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Sin resultados.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/platform/tenants/${t.id}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{t.slug}</div>
                  </TableCell>
                  <TableCell>{t.status}</TableCell>
                  <TableCell>{t.subscriptionStatus}</TableCell>
                  <TableCell>{t.trialEndsAt ? formatDate(t.trialEndsAt) : "—"}</TableCell>
                  <TableCell>
                    <PlatformTenantAlerts
                      hasActiveOwner={t.hasActiveOwner}
                      hasActiveUsers={t.hasActiveUsers}
                      trialExpired={t.trialExpired}
                      trialEndingWithinDays={t.trialEndingWithinDays}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      <form action={extendPlatformTenantTrialAction}>
                        <input type="hidden" name="tenantId" value={t.id} />
                        <input type="hidden" name="additionalDays" value="7" />
                        <input type="hidden" name="returnTo" value="/platform/tenants" />
                        <Button type="submit" variant="outline" size="sm">
                          +7d
                        </Button>
                      </form>
                      {t.status === "ACTIVE" ? (
                        <form action={updatePlatformTenantStatusAction}>
                          <input type="hidden" name="tenantId" value={t.id} />
                          <input type="hidden" name="status" value="SUSPENDED" />
                          <input type="hidden" name="returnTo" value="/platform/tenants" />
                          <Button type="submit" variant="outline" size="sm">
                            Suspender
                          </Button>
                        </form>
                      ) : (
                        <form action={updatePlatformTenantStatusAction}>
                          <input type="hidden" name="tenantId" value={t.id} />
                          <input type="hidden" name="status" value="ACTIVE" />
                          <input type="hidden" name="returnTo" value="/platform/tenants" />
                          <Button type="submit" variant="outline" size="sm">
                            Activar
                          </Button>
                        </form>
                      )}
                      <Button variant="link" className="h-8 px-2" asChild>
                        <Link href={`/platform/tenants/${t.id}`}>Ver</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </PageShell>
  );
}
