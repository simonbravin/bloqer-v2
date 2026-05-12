import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { getPlatformTenantById, ServiceError } from "@bloqer/services";
import { getPlatformServiceContext } from "@/lib/platform-service-context";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ tenantId: string }>;
}

export default async function PlatformTenantDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { tenantId } = await params;
  const ctx = await getPlatformServiceContext(session.user.id);
  let tenant;
  try {
    tenant = await getPlatformTenantById(tenantId, ctx);
  } catch (e) {
    if (e instanceof ServiceError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/platform/tenants">← Tenants</Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/platform/tenants/${tenant.id}/modules`}>Módulos</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/platform/tenants/${tenant.id}/users`}>Usuarios</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/platform/tenants/${tenant.id}/settings`}>Ajustes SaaS</Link>
          </Button>
        </div>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{tenant.name}</h1>
        <p className="text-sm text-muted-foreground font-mono">{tenant.slug}</p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Estado operativo</dt>
          <dd>{tenant.status}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Suscripción (interno)</dt>
          <dd>{tenant.subscriptionStatus}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Plan</dt>
          <dd>{tenant.saasPlan}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Trial hasta</dt>
          <dd>{tenant.trialEndsAt ? tenant.trialEndsAt.toLocaleDateString("es-AR") : "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Billing customer id (placeholder)</dt>
          <dd className="break-all">{tenant.billingCustomerId ?? "—"}</dd>
        </div>
        {tenant.suspendedReason ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Motivo suspensión</dt>
            <dd>{tenant.suspendedReason}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
