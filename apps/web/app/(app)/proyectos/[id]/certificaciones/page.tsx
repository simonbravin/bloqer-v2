import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { CertificationListSection } from "@/features/certifications";
import { getCurrentUser } from "@/lib/auth";
import { listCertificationsByProject, getProjectShellInfo, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CertificacionesPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    await getProjectShellInfo(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const certs = await listCertificationsByProject(id, ctx);

  const serialized = certs.map((c) => ({
    id: c.id,
    projectId: id,
    code: c.code,
    periodStart: c.periodStart,
    periodEnd: c.periodEnd,
    status: c.status,
    totalAmount: c.totalAmount,
    currency: c.currency,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Certificaciones"
        subtitle={`${serialized.length} ${serialized.length === 1 ? "certificación" : "certificaciones"}`}
        actions={
          <>
            <Suspense fallback={null}>
              <ListViewToggle storageKey={`certificaciones-${id}`} />
            </Suspense>
            <Button asChild>
              <Link href={`/proyectos/${id}/certificaciones/nueva`}>Nueva certificación</Link>
            </Button>
          </>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <CertificationListSection certifications={serialized} projectId={id} />
      </Suspense>
    </PageShell>
  );
}
