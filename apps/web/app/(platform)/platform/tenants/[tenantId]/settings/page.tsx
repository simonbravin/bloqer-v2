import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { getPlatformTenantById, ServiceError } from "@bloqer/services";
import { getPlatformServiceContext } from "@/lib/platform-service-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  updatePlatformTenantPlanMetadataAction,
  updatePlatformTenantStatusAction,
} from "@/app/(platform)/platform-actions";

const TENANT_STATUSES = ["ACTIVE", "SUSPENDED", "INACTIVE"] as const;
const SUB_STATUSES = ["NONE", "TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED"] as const;

interface PageProps {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}

export default async function PlatformTenantSettingsPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { tenantId } = await params;
  const sp = await searchParams;
  const ctx = await getPlatformServiceContext(session.user.id);
  let tenant;
  try {
    tenant = await getPlatformTenantById(tenantId, ctx);
  } catch (e) {
    if (e instanceof ServiceError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }

  const trialStr = tenant.trialEndsAt
    ? tenant.trialEndsAt.toISOString().slice(0, 10)
    : "";

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/platform/tenants/${tenantId}`}>← Tenant</Link>
        </Button>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Ajustes SaaS</h1>
      {sp.ok ? (
        <p className="text-sm text-muted-foreground">Cambios guardados.</p>
      ) : null}
      {sp.err ? (
        <p className="text-sm text-destructive" role="alert">
          {decodeURIComponent(sp.err)}
        </p>
      ) : null}

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Estado operativo</h2>
        <form action={updatePlatformTenantStatusAction} className="grid gap-3">
          <input type="hidden" name="tenantId" value={tenant.id} />
          <div className="grid gap-1">
            <Label htmlFor="status">Estado</Label>
            <select
              id="status"
              name="status"
              defaultValue={tenant.status}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {TENANT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="suspendedReason">Motivo suspensión (opcional)</Label>
            <Textarea
              id="suspendedReason"
              name="suspendedReason"
              rows={2}
              defaultValue={tenant.suspendedReason ?? ""}
              maxLength={512}
            />
          </div>
          <Button type="submit" size="sm">
            Guardar estado
          </Button>
        </form>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Plan y suscripción (interno)</h2>
        <form action={updatePlatformTenantPlanMetadataAction} className="grid gap-3">
          <input type="hidden" name="tenantId" value={tenant.id} />
          <div className="grid gap-1">
            <Label htmlFor="saasPlan">Plan (slug)</Label>
            <Input id="saasPlan" name="saasPlan" defaultValue={tenant.saasPlan} maxLength={64} required />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="subscriptionStatus">Estado de suscripción</Label>
            <select
              id="subscriptionStatus"
              name="subscriptionStatus"
              defaultValue={tenant.subscriptionStatus}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {SUB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="trialEndsAt">Fin de trial</Label>
            <Input id="trialEndsAt" name="trialEndsAt" type="date" defaultValue={trialStr} />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="trialClear" className="rounded border" />
              Quitar fecha de trial
            </label>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="billingCustomerId">Billing customer id (placeholder)</Label>
            <Input
              id="billingCustomerId"
              name="billingCustomerId"
              defaultValue={tenant.billingCustomerId ?? ""}
              maxLength={255}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="billingClear" className="rounded border" />
              Vaciar billing customer id
            </label>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="platformInternalNotes">Notas internas</Label>
            <Textarea
              id="platformInternalNotes"
              name="platformInternalNotes"
              rows={4}
              defaultValue={tenant.platformInternalNotes ?? ""}
              maxLength={8000}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="notesClear" className="rounded border" />
              Vaciar notas
            </label>
          </div>
          <Button type="submit" size="sm">
            Guardar metadata
          </Button>
        </form>
      </section>
    </div>
  );
}
