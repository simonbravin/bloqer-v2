import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { getPlatformDashboardSummary, ServiceError } from "@bloqer/services";
import { getPlatformServiceContext } from "@/lib/platform-service-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PlatformHomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ctx = await getPlatformServiceContext(session.user.id);
  let s;
  try {
    s = await getPlatformDashboardSummary(ctx);
  } catch (e) {
    if (e instanceof ServiceError && e.code === "FORBIDDEN") redirect("/dashboard");
    throw e;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consola de plataforma</h1>
        <p className="text-sm text-muted-foreground">Resumen de tenants (sin billing externo).</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Totales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Tenants:</span> {s.totalTenants}
          </p>
          <p>
            <span className="text-muted-foreground">Trials que vencen en 7 días:</span>{" "}
            {s.trialsEndingWithin7Days}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por estado operativo</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {Object.entries(s.byTenantStatus).map(([k, v]) => (
            <p key={k}>
              {k}: {v}
            </p>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por suscripción (interno)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {Object.entries(s.bySubscriptionStatus).map(([k, v]) => (
            <p key={k}>
              {k}: {v}
            </p>
          ))}
        </CardContent>
      </Card>
      <p className="text-sm">
        <Link href="/platform/tenants" className="text-primary underline-offset-4 hover:underline">
          Ver listado de tenants
        </Link>
      </p>
    </div>
  );
}
