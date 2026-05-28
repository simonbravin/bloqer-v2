import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { getPlatformDashboardSummaryExtended, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { getPlatformServiceContext } from "@/lib/platform-service-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function PlatformHomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ctx = await getPlatformServiceContext(session.user.id);
  let s;
  try {
    s = await getPlatformDashboardSummaryExtended(ctx);
  } catch (e) {
    if (e instanceof ServiceError && e.code === "FORBIDDEN") redirect("/dashboard");
    throw e;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consola de plataforma</h1>
          <p className="text-sm text-muted-foreground">Resumen de organizaciones (metadatos SaaS internos).</p>
        </div>
        <Button asChild>
          <Link href="/platform/tenants/new">Crear organización</Link>
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Organizaciones</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{s.totalTenants}</CardContent>
        </Card>
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Trials ≤7 días</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{s.trialsEndingWithin7Days}</CardContent>
        </Card>
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Trials vencidos</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{s.trialsExpired}</CardContent>
        </Card>
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sin OWNER activo</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{s.tenantsWithoutActiveOwner}</CardContent>
        </Card>
      </div>
      <Card className="rounded-xl border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Por estado operativo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {Object.entries(s.byTenantStatus).map(([k, v]) => (
            <p key={k}>
              {k}: {v}
            </p>
          ))}
        </CardContent>
      </Card>
      <Card className="rounded-xl border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Por suscripción (interno)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {Object.entries(s.bySubscriptionStatus).map(([k, v]) => (
            <p key={k}>
              {k}: {v}
              {k === "PAST_DUE" && v > 0 ? (
                <span className="text-muted-foreground"> — revisar en Vencimientos</span>
              ) : null}
            </p>
          ))}
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link href="/platform/tenants">Organizaciones</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/platform/vencimientos">Vencimientos y alertas</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/platform/registro">Registro de actividad</Link>
        </Button>
      </div>
    </PageShell>
  );
}
