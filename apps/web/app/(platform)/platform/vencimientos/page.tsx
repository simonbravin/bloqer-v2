import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { listPlatformExpirationAttention, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { getPlatformServiceContext } from "@/lib/platform-service-context";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLATFORM_EXPIRATION_CATEGORY_LABEL_ES } from "@/features/platform/platform-audit-labels";
import {
  extendPlatformTenantTrialAction,
  updatePlatformTenantStatusAction,
} from "@/app/(platform)/platform-actions";

export default async function PlatformVencimientosPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ctx = await getPlatformServiceContext(session.user.id);
  let rows;
  try {
    rows = await listPlatformExpirationAttention(ctx);
  } catch (e) {
    if (e instanceof ServiceError && e.code === "FORBIDDEN") redirect("/dashboard");
    throw e;
  }

  return (
    <PageShell variant="wide" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vencimientos y alertas</h1>
        <p className="text-sm text-muted-foreground">
          Trials por vencer o vencidos, mora, suspensiones y organizaciones sin OWNER o sin usuarios activos.
        </p>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organización</TableHead>
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
                  No hay organizaciones que requieran atención en este momento.
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
                    <div className="flex flex-wrap gap-1">
                      {t.categories.map((c) => (
                        <Badge key={c} variant="outline" className="text-[10px] font-normal">
                          {PLATFORM_EXPIRATION_CATEGORY_LABEL_ES[c] ?? c}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      <form action={extendPlatformTenantTrialAction}>
                        <input type="hidden" name="tenantId" value={t.id} />
                        <input type="hidden" name="additionalDays" value="7" />
                        <input type="hidden" name="returnTo" value="/platform/vencimientos" />
                        <Button type="submit" variant="outline" size="sm">
                          +7d trial
                        </Button>
                      </form>
                      {t.status !== "ACTIVE" ? (
                        <form action={updatePlatformTenantStatusAction}>
                          <input type="hidden" name="tenantId" value={t.id} />
                          <input type="hidden" name="status" value="ACTIVE" />
                          <input type="hidden" name="returnTo" value="/platform/vencimientos" />
                          <Button type="submit" variant="outline" size="sm">
                            Activar
                          </Button>
                        </form>
                      ) : (
                        <form action={updatePlatformTenantStatusAction}>
                          <input type="hidden" name="tenantId" value={t.id} />
                          <input type="hidden" name="status" value="SUSPENDED" />
                          <input type="hidden" name="returnTo" value="/platform/vencimientos" />
                          <Button type="submit" variant="outline" size="sm">
                            Suspender
                          </Button>
                        </form>
                      )}
                      <Button variant="link" className="h-8 px-2" asChild>
                        <Link href={`/platform/tenants/${t.id}/settings`}>Suscripción</Link>
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
