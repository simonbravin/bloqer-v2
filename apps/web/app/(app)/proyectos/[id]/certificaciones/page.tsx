import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { CertificationList } from "@/features/certifications";
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

  let project;
  try {
    project = await getProjectShellInfo(id, ctx);
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
        projectId={id}
        projectName={project.name}
        title="Certificaciones"
        subtitle={`${serialized.length} ${serialized.length === 1 ? "certificación" : "certificaciones"}`}
        actions={
          <Button asChild>
            <Link href={`/proyectos/${id}/certificaciones/nueva`}>Nueva certificación</Link>
          </Button>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <div className="rounded-lg border bg-card">
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold">Historial</h2>
          </div>
          <div className="px-6 py-4">
            <CertificationList certifications={serialized} projectId={id} />
          </div>
        </div>
      </Suspense>
    </PageShell>
  );
}
