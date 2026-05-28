import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { getPlatformTenantById, listPlatformTenantCompanies, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { TenantInvitationForm } from "@/features/platform";
import { createPlatformTenantInvitationAction } from "@/app/(platform)/platform-invitation-actions";
import { getPlatformServiceContext } from "@/lib/platform-service-context";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ err?: string }>;
}

export default async function PlatformTenantInvitationsNewPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { tenantId } = await params;
  const sp = await searchParams;
  const ctx = await getPlatformServiceContext(session.user.id);

  let tenant;
  let companies;
  try {
    [tenant, companies] = await Promise.all([
      getPlatformTenantById(tenantId, ctx),
      listPlatformTenantCompanies(tenantId, ctx),
    ]);
  } catch (e) {
    if (e instanceof ServiceError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }

  let errMsg: string | null = null;
  if (sp.err) {
    try {
      errMsg = decodeURIComponent(sp.err);
    } catch {
      errMsg = sp.err;
    }
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/platform/tenants/${tenantId}/invitations`}>← Invitaciones</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invitar usuario</h1>
        <p className="text-sm text-muted-foreground">
          Organización: <span className="font-medium text-foreground">{tenant.name}</span>
        </p>
      </div>
      {errMsg ? (
        <p className="text-sm text-destructive" role="alert">
          {errMsg}
        </p>
      ) : null}
      <TenantInvitationForm
        action={createPlatformTenantInvitationAction}
        tenantId={tenantId}
        companies={companies}
      />
    </PageShell>
  );
}
